#!/usr/bin/env python3
"""Reproduce proposal catalog, audited names, and WAC/WMTS context assets.

Network sources are public NASA/USGS/PDS data. No credentials are required.
The proposal constants are application inputs, not measured science values.
"""
from __future__ import annotations
import argparse, concurrent.futures, csv, datetime, hashlib, json, math
import pathlib, re, shutil, urllib.request, xml.etree.ElementTree as ET, zipfile

HERE = pathlib.Path(__file__).resolve().parents[1]
RADIUS_M = 1737400.0
SITES = [
    ("A", "Site A — Shackleton Rim", -89.24, 32.40, 1280, 92.4),
    ("B", "Site B — Shackleton–de Gerlache Connecting Ridge", -88.82, 12.10, 740, 78.6),
    ("C", "Site C — Faustini Crater Floor", -89.62, 178.30, -3850, 34.2),
    ("D", "Site D — Malapert Mountain Massif", -85.91, 12.92, 4950, 89.2),
    ("E", "Site E — Nobile Crater Rim", -85.22, 36.12, 620, 74.5),
    ("SHIV", "Shiv Shakti — Chandrayaan-3 landing point", -69.37, 32.32, -1200, 50.1),
]
PROFILES = [
    ("clps_lander", "CLPS Commercial Lander", 1, 2.2, 70, 48, 80, 12, 12),
    ("solar_rover", "Solar-Powered Exploration Rover", 4, 1.2, 65, 72, 60, 48, 15),
    ("science_station", "Lunar Surface Science Station", 12, 3.5, 60, 120, 75, 36, 15),
    ("exploration_base", "Sustained South Pole Exploration Base", 24, 10.0, 75, 60, 85, 24, 10),
    ("custom", "Custom Mission Configuration", 6, 2.0, 50, 96, 50, 48, 15),
]
DOWNLOADS = [
    ("usgs_moon_names", "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz", "metadata/catalog/MOON_nomenclature_center_pts.kmz", "https://planetarynames.wr.usgs.gov/GIS_Downloads"),
    ("lroc_wac_global_16ppd", "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/BROWSE/WAC_GLOBAL/WAC_GLOBAL_E000N0000_016P.TIF", "data/imagery/WAC_GLOBAL_E000N0000_016P.TIF", "https://data.lroc.im-ldi.com/lroc/view_rdr_product/WAC_GLOBAL_E000N0000_016P"),
    ("wmts_wac_global", "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml", "metadata/imagery/wac_global_capabilities.xml", "https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon"),
    ("wmts_wac_south_illumination", "https://trek.nasa.gov/tiles/Moon/SP/WAC_POLE_ILL_PCT_SOUTH_100M/1.0.0/WMTSCapabilities.xml", "metadata/imagery/wac_south_illumination_capabilities.xml", "https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon"),
    ("wmts_earth_visibility", "https://trek.nasa.gov/tiles/Moon/SP/AVGVISIB_85S_060M_201608_EARTH_SP/1.0.0/WMTSCapabilities.xml", "metadata/imagery/earth_visibility_capabilities.xml", "https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon"),
]

def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")

def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)

def download(record, root):
    sid, url, relative, catalog = record
    path = root / relative; path.parent.mkdir(parents=True, exist_ok=True)
    headers = {}
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "LunarSight-DataPreparation/1.0 (academic data preparation)"})
        temp = path.with_suffix(path.suffix + ".part")
        with urllib.request.urlopen(req, timeout=180) as response, temp.open("wb") as f:
            headers = dict(response.headers)
            shutil.copyfileobj(response, f, 1024 * 1024)
        expected = headers.get("Content-Length")
        if expected and temp.stat().st_size != int(expected):
            raise IOError(f"Incomplete download: {url}")
        temp.replace(path)
    digest = hashlib.file_digest(path.open("rb"), "sha256").hexdigest()
    result = {"source_id": sid, "source_url": url, "catalog_url": catalog,
              "local_path": relative, "bytes": path.stat().st_size,
              "sha256": digest, "retrieved_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "http_headers": headers}
    print(f"ready {sid}: {result['bytes']:,} bytes", flush=True)
    return result

def angular_distance_km(lat1, lon1, lat2, lon2):
    p1,p2 = math.radians(lat1),math.radians(lat2)
    dl,dp = math.radians(lon2-lon1),p2-p1
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*RADIUS_M/1000*math.asin(math.sqrt(min(1,max(0,a))))

def prepare_inputs(root):
    rows = [{"site_id":sid,"proposal_name":name,"lat_deg":lat,"lon_deg_east":lon,
             "coordinate_status":"proposal_input_unverified_name","coordinate_frame_assumption":"MOON_ME_DE421",
             "proposal_source":"LunarSight V2 Product Proposal, 2026-11-05, section 5.1"}
            for sid,name,lat,lon,_,_ in SITES]
    write_csv(root/"data/catalog/sites.csv",rows)
    write_json(root/"data/catalog/sites.json",rows)
    write_json(root/"data/catalog/sites.geojson",{"type":"FeatureCollection",
        "coordinate_system_note":"Lunar planetocentric degrees east; NOT terrestrial WGS84. GeoJSON container for app use only.",
        "features":[{"type":"Feature","id":r["site_id"],"geometry":{"type":"Point","coordinates":[r["lon_deg_east"],r["lat_deg"]]},"properties":r} for r in rows]})
    demos = [{"site_id":sid,"proposal_name":name,"lat_deg":lat,"lon_deg_east":lon,
              "demo_elevation_m":elev,"demo_annual_sunlight_pct":sun,
              "status":"UNVERIFIED_DEMO_DO_NOT_USE_AS_SCIENCE"} for sid,name,lat,lon,elev,sun in SITES]
    write_csv(root/"data/catalog/proposal_snapshot/unverified_display_values.csv", demos)
    write_json(root/"data/catalog/proposal_snapshot/unverified_dossier_values.json", {
        "status":"UNVERIFIED_DEMO_DO_NOT_USE_AS_SCIENCE",
        "A":{"annual_illumination_pct":92.4,"maximum_shadow_hours":54,"earth_visibility_pct":98.2,"water_ice_equivalent_wt_pct":0.8,"distance_to_psr_km":2.1,"thermal_min_K":110,"thermal_max_K":285},
        "C":{"water_ice_equivalent_wt_pct":5.6,"thermal_min_K":38,"thermal_max_K":160},
        "source":"User proposal sections 5.1 and 10.1. Preserved only for reconciliation; never merge as scientific attributes."})
    fields = ["profile_id","name","default_duration_months","mast_height_m","min_sunlight_pct","max_darkness_hours","min_earth_visibility_pct","max_blackout_hours","max_slope_deg"]
    profiles = [dict(zip(fields,r))|{"status":"application_preset_not_official_mission_requirement"} for r in PROFILES]
    write_csv(root/"data/catalog/mission_profiles.csv", profiles)
    write_json(root/"data/catalog/mission_profiles.json", profiles)
    write_json(root/"data/catalog/scenario_presets.json", {
        "landing_dates_utc":[f"{s}T00:00:00Z" for s in ["2026-01-01","2026-04-01","2026-07-01","2026-10-01","2027-01-01"]],
        "duration_months":{"min":1,"max":36,"interpretation":"calendar months; clamp end day to last day of target month; end timestamp excluded"},
        "custom_coordinates":{"lat_deg_min":-90,"lat_deg_max":-60,"lon_deg_east_min":0,"lon_deg_east_max":360,"normalization":"360 degrees maps to 0; longitude undefined at exact pole"},
        "horizon_mast_presets_m":[1.2,2.5,10],"map_slope_hazard_threshold_deg":15,
        "sensitivity":{"date_offset_days":{"min":-30,"max":30,"step":1},"mast_height_m":{"min":1,"max":15,"step":0.5},"lat_offset_deg":{"min":-0.2,"max":0.2,"step":0.01},"lon_offset_deg":{"min":-1,"max":1,"step":0.05}},
        "source":"User proposal; application settings only. Seasonal/mission labels omitted because unverified."})

def parse_names(root):
    path = root/"metadata/catalog/MOON_nomenclature_center_pts.kmz"
    ns={"k":"http://www.opengis.net/kml/2.2"}
    with zipfile.ZipFile(path) as z:
        kml = z.read(next(n for n in z.namelist() if n.lower().endswith(".kml")))
    tree = ET.fromstring(kml)
    names=[]
    for p in tree.findall(".//k:Placemark",ns):
        point = p.find(".//k:Point/k:coordinates",ns)
        if point is None or not point.text: continue
        lon,lat,*_ = map(float,point.text.strip().split()[0].split(","))
        name=p.findtext("k:name",default="",namespaces=ns)
        desc=p.findtext("k:description",default="",namespaces=ns)
        data={}
        for s in p.findall(".//k:SimpleData",ns): data[s.attrib.get("name","")]=s.text
        for s in p.findall(".//k:Data",ns): data[s.attrib.get("name","")]=s.findtext("k:value",default="",namespaces=ns)
        names.append({"name":name,"lat_deg":lat,"lon_deg_east":lon%360,"attributes":data,"description_html":desc})
    southern=[n for n in names if n["lat_deg"]<=-60]
    write_json(root/"data/catalog/usgs_named_features_south60.json",southern)
    selected=[n for n in names if any(q.lower() in n["name"].lower() for q in ["Shackleton","Gerlache","Faustini","Malapert","Nobile","Shiv Shakti"])]
    write_json(root/"data/catalog/nomenclature_reference_features.json",selected)
    print("nomenclature selected:",[(n["name"],n["lat_deg"],n["lon_deg_east"]) for n in selected],flush=True)
    matches={"A":["Shackleton"],"B":["Shackleton","de Gerlache"],"C":["Faustini"],"D":["Mons Malapert","Malapert"],"E":["Nobile"],"SHIV":["Statio Shiv Shakti","Shiv Shakti"]}
    audits=[]
    for sid,label,lat,lon,*_ in SITES:
        candidates=[n for n in selected if n["name"] in matches[sid]]
        for n in candidates:
            audits.append({"site_id":sid,"proposal_name":label,"proposal_lat_deg":lat,"proposal_lon_deg_east":lon,
                "reference_feature_name":n["name"],"reference_center_lat_deg":n["lat_deg"],"reference_center_lon_deg_east":n["lon_deg_east"],
                "distance_to_named_center_km":round(angular_distance_km(lat,lon,n["lat_deg"],n["lon_deg_east"]),3),
                "reference_diameter_km":n["attributes"].get("diameter"),
                "reference_feature_type":n["attributes"].get("type"),
                "reference_feature_url":n["attributes"].get("link","").replace("http:","https:"),
                "interpretation":"Distance to feature center only. Rim/ridge names require separate geographic review; no coordinate has been moved.",
                "source_url":"https://planetarynames.wr.usgs.gov/GIS_Downloads"})
    if audits: write_csv(root/"data/catalog/site_name_audit.csv",audits)
    write_json(root/"data/catalog/coordinate_review.json", {
        "no_coordinates_modified":True,
        "method":"Great-circle center distances on a sphere of radius 1737.4 km; names and diameters from downloaded USGS/IAU gazetteer snapshot. Centers and diameters do not define precise rim polygons.",
        "findings":[
            {"site_id":"A","status":"needs_geographic_review","note":"26.277 km from Shackleton center; catalog crater diameter 20.925 km. Proposed rim label is not substantiated at this coordinate."},
            {"site_id":"B","status":"needs_geographic_review","note":"Connecting ridge is not a named polygon in this gazetteer. Distances to crater centers are 41.390 km (Shackleton) and 63.141 km (de Gerlache); use a source map to verify the ridge label."},
            {"site_id":"C","status":"name_coordinate_mismatch","note":"86.979 km from Faustini center; catalog diameter 42.485 km. This coordinate is inconsistent with a Faustini crater-floor label. The data pack intentionally evaluates the proposal coordinate."},
            {"site_id":"D","status":"needs_geographic_review","note":"Compare with Mons Malapert (mountain) as well as Malapert (crater); do not equate their centers. Massif membership is not confirmed by a center-point catalog."},
            {"site_id":"E","status":"needs_geographic_review","note":"42.964 km from Nobile center, catalog diameter 79.272 km. A western rim association may be plausible but is not confirmed by this point catalog."},
            {"site_id":"SHIV","status":"rounded_coordinate_match","note":"Proposal agrees with Statio Shiv Shakti when rounded to 0.01 degree; 0.103 km center displacement reflects rounded input. Exact gazetteer coordinate is retained separately, not silently substituted."}
        ]})
    return {"global_feature_count":len(names),"south60_feature_count":len(southern),"selected_feature_count":len(selected)}

def prepare_wmts(root):
    ns={"w":"http://www.opengis.net/wmts/1.0","o":"http://www.opengis.net/ows/1.1"}
    results=[]
    for sid,url,path,_ in DOWNLOADS[2:]:
        t=ET.parse(root/path)
        layers=[]
        for l in t.findall(".//w:Layer",ns):
            layers.append({"id":l.findtext("o:Identifier",namespaces=ns),"formats":[x.text for x in l.findall("w:Format",ns)],
                "templates":[x.attrib for x in l.findall("w:ResourceURL",ns)],
                "tile_matrix_set_links":[x.text for x in l.findall("w:TileMatrixSetLink/w:TileMatrixSet",ns)]})
        sets=[]
        for s in t.findall(".//w:Contents/w:TileMatrixSet",ns):
            sets.append({"id":s.findtext("o:Identifier",namespaces=ns),"crs":s.findtext("o:SupportedCRS",namespaces=ns),
                "matrices":[{x.tag.split("}")[-1]:x.text for x in m} for m in s.findall("w:TileMatrix",ns)]})
        results.append({"source_id":sid,"capabilities_url":url,"local_capabilities":path,"layers":layers,"tile_matrix_sets":sets,
            "usage":"Visualization only; do not calculate physical quantities from tile colors.",
            "crs_caution":"Custom lunar CRS, not Earth EPSG:3857. EPSG:0 in polar capability is a placeholder."})
    write_json(root/"data/imagery/wmts_sources.json",results)

def main():
    p=argparse.ArgumentParser();p.add_argument("--root",type=pathlib.Path,default=HERE);p.add_argument("--inputs-only",action="store_true");a=p.parse_args()
    prepare_inputs(a.root)
    if a.inputs_only: return
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        manifests=list(pool.map(lambda r:download(r,a.root),DOWNLOADS))
    counts=parse_names(a.root);prepare_wmts(a.root)
    write_json(a.root/"metadata/catalog/source_manifest.json",{"sources":manifests,"counts":counts})
    print(json.dumps(counts),flush=True)

if __name__=="__main__": main()
