import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import type { LocalTerrainMesh } from '../data/contract';

/** Low → high colour stops of the elevation ramp; mirrored in the HTML legend. */
export const RAMP_STOPS = ['#20284f', '#3b6f8e', '#7fae8a', '#d9c98a', '#f4efe6'] as const;
const RAMP = RAMP_STOPS.map((hex) => new Color(hex));

export type SurfaceMode = 'realistic' | 'elevation';

/** The two shared surface materials; one instance each per viewer, disposed with it. */
export interface TerrainMaterials {
  relief: MeshStandardMaterial;
  elevation: MeshStandardMaterial;
}

export function createTerrainMaterials(): TerrainMaterials {
  return {
    // Neutral regolith grey; fully rough, non-metallic. Relief comes from the mesh normals,
    // the single Sun light and its shadow map; no texture pretends to be imagery.
    relief: new MeshStandardMaterial({ color: 0x9a958d, roughness: 1, metalness: 0 }),
    elevation: new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  };
}

function rampColor(t: number, out: Color): Color {
  const x = Math.min(0.999999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  return out.copy(RAMP[i]!).lerp(RAMP[i + 1]!, x - i);
}

export interface TerrainObject {
  group: Group;
  dispose(): void;
}

/**
 * GPU objects for a loaded local mesh. The loader keeps ownership of the source arrays:
 * BufferAttributes reference them read-only (never mutated here); the only array created is
 * the per-vertex elevation colour, built once per mesh from `heightsM` (reference-sphere
 * elevation, not local y). Disposing frees GPU buffers without touching the loader cache.
 */
export function createTerrainObject(mesh: LocalTerrainMesh, materials: TerrainMaterials, mode: SurfaceMode): TerrainObject {
  const group = new Group();
  group.name = 'local-terrain';
  const geometries: BufferGeometry[] = [];
  const span = mesh.maxHeightM - mesh.minHeightM > 1e-6 ? mesh.maxHeightM - mesh.minHeightM : 1;
  const color = new Color();
  for (const chunk of mesh.chunks) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(chunk.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(chunk.normals, 3));
    geometry.setIndex(new BufferAttribute(chunk.indices, 1));
    const colors = new Float32Array(chunk.heightsM.length * 3);
    for (let i = 0; i < chunk.heightsM.length; i++) {
      rampColor((chunk.heightsM[i]! - mesh.minHeightM) / span, color);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const object = new Mesh(geometry, mode === 'elevation' ? materials.elevation : materials.relief);
    object.name = chunk.id;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
  }
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

export function setTerrainMode(object: TerrainObject, materials: TerrainMaterials, mode: SurfaceMode): void {
  const material = mode === 'elevation' ? materials.elevation : materials.relief;
  for (const child of object.group.children) if (child instanceof Mesh) child.material = material;
}
