// Generates web/public/models/lander.glb: an original, generic low-poly robotic
// lunar lander built procedurally with three.js and exported as binary glTF.
//
// Model contract (consumed by the 3D viewer):
// - metres, +Y up; all four footpads rest on y = 0; centred on x = z = 0
// - root node "Lander"; empty nodes "EngineNozzle" (engine bell exit centre,
//   exhaust toward -Y) and "AntennaTip" (high-gain dish feed point)
// - untextured MeshStandardMaterial only; deterministic byte output
//
// Usage: node scripts/build-lander-model.mjs   (from web/)

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/lander.glb');
const MAX_BYTES = 300 * 1024;

// GLTFExporter's binary mode reads Blobs through the browser FileReader API,
// which Node does not provide. Blob is global in Node; FileReader is shimmed.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    onload = null;
    onloadend = null;
    onerror = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (buffer) => this.#finish(buffer),
        (error) => this.onerror?.(error),
      );
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (buffer) => {
          const type = blob.type || 'application/octet-stream';
          this.#finish(`data:${type};base64,${Buffer.from(buffer).toString('base64')}`);
        },
        (error) => this.onerror?.(error),
      );
    }

    #finish(result) {
      this.result = result;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }
  };
}

// ---------------------------------------------------------------------------
// Materials: a small shared palette.

const MATERIALS = {
  goldFoil: new THREE.MeshStandardMaterial({ name: 'GoldFoil', color: 0xe8b64c, metalness: 0.5, roughness: 0.38 }),
  amberFoil: new THREE.MeshStandardMaterial({ name: 'AmberFoil', color: 0xcf9236, metalness: 0.5, roughness: 0.45 }),
  whitePaint: new THREE.MeshStandardMaterial({ name: 'WhitePaint', color: 0xe6e6e1, metalness: 0.05, roughness: 0.65 }),
  structure: new THREE.MeshStandardMaterial({ name: 'Structure', color: 0xa9aeb5, metalness: 0.55, roughness: 0.45 }),
  darkMetal: new THREE.MeshStandardMaterial({ name: 'DarkMetal', color: 0x3a3d43, metalness: 0.6, roughness: 0.5 }),
  solarCell: new THREE.MeshStandardMaterial({ name: 'SolarCell', color: 0x1b2f72, metalness: 0.35, roughness: 0.28 }),
  beacon: new THREE.MeshStandardMaterial({
    name: 'Beacon',
    color: 0xff5a3c,
    emissive: 0xff3b1f,
    emissiveIntensity: 1.5,
    metalness: 0,
    roughness: 0.4,
  }),
};

// ---------------------------------------------------------------------------
// Geometry helpers. Every part is a closed solid with transforms baked in so
// parts sharing a material can be merged into a single mesh.

const UP = new THREE.Vector3(0, 1, 0);

/** Keeps only position + normal (untextured model) and guarantees an index. */
function clean(geometry) {
  const g = geometry.index ? geometry : mergeVertices(geometry);
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  return g;
}

/** Flips triangle winding if the closed solid's signed volume is negative. */
function orientOutward(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    volume += a.dot(b.clone().cross(c));
  }
  if (volume < 0) {
    for (let i = 0; i < idx.count; i += 3) {
      const tmp = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, tmp);
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Hard-edged low-poly look: one normal per facet, re-indexed to stay compact. */
function facet(geometry) {
  const source = (geometry.index ? geometry.toNonIndexed() : geometry).attributes.position;
  // Drop zero-area triangles (e.g. lathe faces on the axis): they have no normal.
  const kept = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < source.count; i += 3) {
    a.fromBufferAttribute(source, i);
    b.fromBufferAttribute(source, i + 1);
    c.fromBufferAttribute(source, i + 2);
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-14) {
      kept.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  g.computeVertexNormals();
  return mergeVertices(g, 1e-5);
}

function place(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return geometry.applyMatrix4(m);
}

function box(w, h, d, transform) {
  return place(clean(new THREE.BoxGeometry(w, h, d)), transform);
}

/** Faceted prism / frustum standing on its base centre (y from 0 to h). */
function prism(radiusTop, radiusBottom, h, sides, transform, rotateY = 0) {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, h, sides, 1, false, rotateY);
  g.translate(0, h / 2, 0);
  return place(facet(g), transform);
}

/** Round strut between two points. */
function strut(from, to, radius, sides = 8) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const g = clean(new THREE.CylinderGeometry(radius, radius, dir.length(), sides, 1));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(...a.add(b).multiplyScalar(0.5).toArray());
  return g;
}

function sphere(radius, position, widthSegments = 10, heightSegments = 6) {
  return place(clean(new THREE.SphereGeometry(radius, widthSegments, heightSegments)), { position });
}

/** Closed surface of revolution from a closed profile loop of [r, y] pairs. */
function lathe(profile, segments, transform) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  return place(orientOutward(facet(g)), transform);
}

// ---------------------------------------------------------------------------
// Design dimensions (metres).

const BODY_BOTTOM = 1.15;
const BODY_TOP = 2.55;
const BODY_RADIUS = 1.0; // octagon circumradius
const BODY_APOTHEM = BODY_RADIUS * Math.cos(Math.PI / 8);
const DECK_THICKNESS = 0.1;
const DECK_TOP = BODY_TOP + DECK_THICKNESS;
const FOOTPAD_RADIUS_FROM_AXIS = 2.25; // footpad centres, diagonal directions
const NOZZLE_EXIT_Y = 0.55;
// Octagon rotated so flat faces point along the axes and the diagonals.
const OCTAGON_PHASE = Math.PI / 8;

// Each part list collects geometry per shared material.
const parts = Object.fromEntries(Object.keys(MATERIALS).map((key) => [key, []]));
const add = (material, geometry) => parts[material].push(geometry);

function radial(angle, radius, y) {
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function buildBody() {
  const height = BODY_TOP - BODY_BOTTOM;
  add('darkMetal', prism(BODY_RADIUS * 0.97, BODY_RADIUS * 0.97, height, 8, { position: [0, BODY_BOTTOM, 0] }, OCTAGON_PHASE));

  // Insulation blankets: one slightly bulged panel per octagon face, alternating
  // two foil tones so the facets read clearly at distance.
  const faceWidth = 2 * BODY_RADIUS * Math.sin(Math.PI / 8);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const panel = facet(new THREE.BoxGeometry(0.08, height * 0.9, faceWidth * 0.94, 1, 2, 2));
    // Push the middle vertices outward a little for a quilted, pillowed foil look.
    const pos = panel.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      if (pos.getX(v) > 0 && Math.abs(pos.getY(v)) < 1e-6 && Math.abs(pos.getZ(v)) < 1e-6) pos.setX(v, pos.getX(v) + 0.05);
    }
    panel.computeVertexNormals();
    const g = facet(panel);
    g.rotateY(-angle);
    g.translate(...radial(angle, BODY_APOTHEM, (BODY_BOTTOM + BODY_TOP) / 2));
    add(i % 2 === 0 ? 'goldFoil' : 'amberFoil', g);
  }

  // Top and bottom decks overhang the body to give a crisp outline.
  add('whitePaint', prism(BODY_RADIUS * 1.1, BODY_RADIUS * 1.1, DECK_THICKNESS, 8, { position: [0, BODY_TOP, 0] }, OCTAGON_PHASE));
  add('structure', prism(BODY_RADIUS * 1.05, BODY_RADIUS * 0.95, 0.08, 8, { position: [0, BODY_BOTTOM - 0.08, 0] }, OCTAGON_PHASE));

  // Avionics box and radiator fins on the top deck.
  add('whitePaint', box(0.6, 0.22, 0.42, { position: [0.15, DECK_TOP + 0.11, -0.05] }));
  for (let i = 0; i < 4; i += 1) {
    add('structure', box(0.5, 0.12, 0.02, { position: [0.15, DECK_TOP + 0.28, -0.2 + i * 0.1] }));
  }
}

function buildEngine() {
  const throatY = BODY_BOTTOM - 0.05;
  // Closed bell shell: outer wall down to the exit lip, then inner wall back up.
  const outer = [
    [0.2, throatY + 0.12],
    [0.22, throatY],
    [0.27, throatY - 0.14],
    [0.35, throatY - 0.3],
    [0.44, throatY - 0.46],
    [0.5, NOZZLE_EXIT_Y],
  ];
  const inner = outer
    .slice()
    .reverse()
    .map(([r, y]) => [r - 0.025, y]);
  inner[0] = [0.475, NOZZLE_EXIT_Y];
  add('darkMetal', lathe([...outer, ...inner, outer[0]], 20));
  // Cooling-band rings around the bell.
  add('structure', lathe([[0.235, throatY - 0.04], [0.29, throatY - 0.04], [0.29, throatY - 0.08], [0.235, throatY - 0.08], [0.235, throatY - 0.04]], 20));
  add('structure', lathe([[0.49, NOZZLE_EXIT_Y + 0.0], [0.53, NOZZLE_EXIT_Y], [0.53, NOZZLE_EXIT_Y + 0.05], [0.47, NOZZLE_EXIT_Y + 0.05], [0.49, NOZZLE_EXIT_Y]], 20));
}

function buildLegs() {
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const hip = radial(angle, BODY_APOTHEM + 0.08, BODY_TOP - 0.45);
    const ankle = radial(angle, FOOTPAD_RADIUS_FROM_AXIS, 0.22);
    const hipV = new THREE.Vector3(...hip);
    const ankleV = new THREE.Vector3(...ankle);

    // Main leg as a shock absorber: thick upper cylinder, slimmer lower piston.
    const sleeveEnd = hipV.clone().lerp(ankleV, 0.6).toArray();
    add('goldFoil', strut(hip, sleeveEnd, 0.075, 8));
    add('structure', strut(sleeveEnd, ankle, 0.045, 8));
    add('structure', sphere(0.09, hip, 8, 5));

    // Two secondary struts from the lower body corners to the leg knee.
    const knee = hipV.clone().lerp(ankleV, 0.62).toArray();
    for (const offset of [-0.32, 0.32]) {
      const base = radial(angle + offset, BODY_RADIUS * 0.98, BODY_BOTTOM + 0.02);
      add('structure', strut(base, knee, 0.03, 6));
    }
    add('structure', sphere(0.06, knee, 8, 5));

    // Footpad: shallow dish-like frustum on the ground plane with a ball joint.
    add('whitePaint', prism(0.2, 0.32, 0.1, 12, { position: [ankle[0], 0, ankle[2]] }));
    add('structure', sphere(0.08, [ankle[0], 0.16, ankle[2]], 8, 5));
  }
}

function buildSolarWings() {
  // Wings stand near-vertical: at the lunar poles the Sun stays low on the horizon.
  const panelLength = 1.5;
  const panelHeight = 1.0;
  const tilt = 0.17; // radians back from vertical
  const cols = 6;
  const rows = 3;
  const cellGap = 0.035;
  const cellW = (panelLength - cellGap * (cols + 1)) / cols;
  const cellH = (panelHeight - cellGap * (rows + 1)) / rows;
  const centreY = 2.25;

  for (const side of [-1, 1]) {
    const innerX = BODY_APOTHEM + 0.45;
    const centreX = side * (innerX + panelLength / 2);
    // Panel is built flat in its own frame, then tilted about the wing axis.
    const panelTransform = { position: [centreX, centreY, 0], rotation: [tilt, 0, 0] };
    add('structure', place(box(panelLength, panelHeight, 0.04), panelTransform));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const x = -panelLength / 2 + cellGap + cellW / 2 + c * (cellW + cellGap);
        const y = -panelHeight / 2 + cellGap + cellH / 2 + r * (cellH + cellGap);
        // Cells are thicker than the frame so they show on both faces and the
        // frame between them reads as a grid.
        add('solarCell', place(box(cellW, cellH, 0.056, { position: [x, y, 0] }), panelTransform));
      }
    }

    // Boom and hinge from the body face to the panel's inner edge.
    add('structure', strut([side * (BODY_APOTHEM + 0.02), centreY, 0], [side * (innerX + 0.02), centreY, 0], 0.045, 8));
    add('darkMetal', box(0.12, 0.16, 0.16, { position: [side * (BODY_APOTHEM + 0.08), centreY, 0] }));
  }
}

function buildAntenna() {
  // Returns the dish feed point in model space.
  const mastBase = [-0.45, DECK_TOP, 0.4];
  const mastTop = [-0.45, DECK_TOP + 0.75, 0.4];
  add('structure', strut(mastBase, mastTop, 0.04, 8));
  add('darkMetal', box(0.16, 0.14, 0.16, { position: [mastTop[0], mastTop[1] + 0.02, mastTop[2]] }));

  // Parabolic dish y = r^2 / (4F), built as a thin closed shell.
  const radius = 0.5;
  const depth = 0.14;
  const focal = (radius * radius) / (4 * depth);
  const thickness = 0.025;
  const steps = 6;
  const front = [];
  const back = [];
  for (let s = 0; s <= steps; s += 1) {
    const r = (radius * s) / steps;
    const y = (r * r) / (4 * focal);
    front.push([r, y + thickness]);
    back.push([r, y]);
  }
  const profile = [...front, ...back.reverse(), front[0]];

  // Dish pivot sits above the gimbal; the dish is tilted toward -X, +Z (Earth side).
  const pivot = new THREE.Vector3(mastTop[0], mastTop[1] + 0.12, mastTop[2]);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0, 0.55));
  const dishMatrix = new THREE.Matrix4().compose(pivot, tilt, new THREE.Vector3(1, 1, 1));

  const local = [];
  local.push(['whitePaint', lathe(profile, 16)]);
  const feed = new THREE.Vector3(0, focal + thickness, 0);
  // Tripod feed support from the rim to the feed horn.
  for (let k = 0; k < 3; k += 1) {
    const a = (k * 2 * Math.PI) / 3 + Math.PI / 6;
    const rim = [Math.cos(a) * radius * 0.92, depth * 0.85 + thickness, Math.sin(a) * radius * 0.92];
    local.push(['structure', strut(rim, feed.toArray(), 0.012, 5)]);
  }
  local.push(['darkMetal', place(prism(0.035, 0.06, 0.1, 8), { position: [0, feed.y - 0.1, 0] })]);
  for (const [material, g] of local) add(material, g.applyMatrix4(dishMatrix));

  return feed.applyMatrix4(dishMatrix);
}

function buildCameraMast() {
  const base = [0.55, DECK_TOP, 0.42];
  const top = [0.55, DECK_TOP + 0.6, 0.42];
  add('structure', strut(base, top, 0.03, 6));
  add('whitePaint', box(0.26, 0.14, 0.16, { position: [top[0], top[1] + 0.07, top[2]] }));
  // Stereo camera lenses facing +Z.
  for (const dx of [-0.07, 0.07]) {
    const lens = clean(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10));
    lens.rotateX(Math.PI / 2);
    lens.translate(top[0] + dx, top[1] + 0.07, top[2] + 0.1);
    add('darkMetal', lens);
  }
  add('beacon', sphere(0.025, [top[0], top[1] + 0.16, top[2]], 6, 4));
}

function buildTanksAndThrusters() {
  // Pressurant tanks hug the body on the +/-Z faces between the legs.
  for (const side of [-1, 1]) {
    const g = clean(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10));
    g.translate(0, 1.75, side * (BODY_APOTHEM + 0.2));
    add('whitePaint', g);
    add('structure', strut([0, 1.75, side * (BODY_APOTHEM + 0.02)], [0, 1.75, side * (BODY_APOTHEM + 0.1)], 0.05, 6));
  }

  // Attitude-control thruster pods on the deck edge above each leg.
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const centre = radial(angle, BODY_RADIUS * 1.02, BODY_TOP - 0.05);
    const pod = box(0.16, 0.16, 0.16, { position: centre, rotation: [0, -angle, 0] });
    add('darkMetal', pod);
    // Two small nozzles: one outward-up, one tangential.
    const dirs = [
      new THREE.Vector3(Math.cos(angle), 0.6, Math.sin(angle)).normalize(),
      new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)),
    ];
    for (const dir of dirs) {
      const cone = clean(new THREE.CylinderGeometry(0.02, 0.05, 0.1, 8));
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
      cone.translate(...new THREE.Vector3(...centre).addScaledVector(dir, 0.12).toArray());
      add('structure', cone);
    }
  }
}

// ---------------------------------------------------------------------------
// Assembly, export and verification.

function assemble() {
  buildBody();
  buildEngine();
  buildLegs();
  buildSolarWings();
  const antennaTip = buildAntenna();
  buildCameraMast();
  buildTanksAndThrusters();

  const root = new THREE.Group();
  root.name = 'Lander';
  for (const [key, geometries] of Object.entries(parts)) {
    if (geometries.length === 0) continue;
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`Failed to merge geometry for material ${key}`);
    merged.normalizeNormals();
    const mesh = new THREE.Mesh(merged, MATERIALS[key]);
    mesh.name = `Lander_${MATERIALS[key].name}`;
    root.add(mesh);
  }

  const nozzle = new THREE.Object3D();
  nozzle.name = 'EngineNozzle';
  nozzle.position.set(0, NOZZLE_EXIT_Y, 0);
  root.add(nozzle);

  const tip = new THREE.Object3D();
  tip.name = 'AntennaTip';
  tip.position.set(...antennaTip.toArray().map(round));
  root.add(tip);

  return root;
}

/** Rounds to millimetres so node positions in the file are stable and readable. */
function round(value) {
  return Math.round(value * 1000) / 1000;
}

function countTriangles(root) {
  let triangles = 0;
  root.traverse((o) => {
    if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return triangles;
}

/** Parses the GLB container and returns the JSON chunk. */
function readGlbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Output is not a GLB file');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB length header mismatch');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error('First GLB chunk is not JSON');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
}

function verify(bytes, root) {
  const json = readGlbJson(bytes);
  const nodes = new Map(json.nodes.map((n) => [n.name, n]));
  for (const name of ['Lander', 'EngineNozzle', 'AntennaTip']) {
    if (!nodes.has(name)) throw new Error(`Missing node ${name}`);
  }
  const box3 = new THREE.Box3().setFromObject(root);
  const centre = box3.getCenter(new THREE.Vector3());
  const fmt = (v) => `(${v.toArray().map((x) => x.toFixed(3)).join(', ')})`;
  const nodePos = (name) => JSON.stringify(nodes.get(name).translation ?? [0, 0, 0]);

  console.log(`wrote ${OUTPUT_PATH}`);
  console.log(`bytes: ${bytes.byteLength}`);
  console.log(`triangles: ${countTriangles(root)}`);
  console.log(`meshes: ${json.meshes.length}, materials: ${json.materials.length}`);
  console.log(`bbox min ${fmt(box3.min)} max ${fmt(box3.max)} centre ${fmt(centre)}`);
  console.log(`nodes: Lander ${nodePos('Lander')}, EngineNozzle ${nodePos('EngineNozzle')}, AntennaTip ${nodePos('AntennaTip')}`);

  if (bytes.byteLength > MAX_BYTES) throw new Error(`GLB exceeds ${MAX_BYTES} bytes`);
  if (Math.abs(box3.min.y) > 1e-4) throw new Error(`Footpads must rest on y = 0, got min.y ${box3.min.y}`);
  if (Math.abs(centre.x) > 0.05 || Math.abs(centre.z) > 0.05) throw new Error('Model is not centred on x = z = 0');
}

async function main() {
  const root = assemble();
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, trs: true });
  const bytes = new Uint8Array(result);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, bytes);
  verify(bytes, root);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
