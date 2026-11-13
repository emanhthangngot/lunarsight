#!/usr/bin/env python3
"""Join the prepared component data into small app-facing catalogs and dossiers."""
from pathlib import Path
import csv,json,hashlib,datetime,math
import rasterio
from prepare_catalog import write_json,write_csv

ROOT=Path(__file__).resolve().parents[1]

def load(rel):return json.loads((ROOT/rel).read_text(encoding='utf-8'))
def by_id(rows):return {r['site_id']:r for r in rows}

def main():
    sites=load('data/catalog/sites.json')
    terrain=by_id(load('data/terrain/site_ground_heights.json'))
    visibility=by_id(load('data/environment/visibility/site_long_term_visibility.json'))
    thermal=by_id(load('data/environment/thermal/site_thermal_summary.json'))
    resources=by_id(load('data/environment/resources/site_resource_evidence.json'))
    review=by_id(load('data/catalog/coordinate_review.json')['findings'])
    slopes=by_id(list(csv.DictReader((ROOT/'data/terrain/site_slope_samples.csv').open())))
    scenarios=load('data/scenarios/scenario_comparison_presets.json')
    dossier=[];flat=[]
    for site in sites:
        sid=site['site_id'];t=terrain[sid];v=visibility[sid];th=thermal[sid];r=resources[sid]
        sl=slopes[sid];sl['slope_deg']=float(sl['slope_deg']);sl['slope_grid_spacing_m']=float(sl['slope_grid_spacing_m'])
        entry={'site_id':sid,'proposal_label':site['proposal_name'],
            'coordinates':{'lat_deg':site['lat_deg'],'lon_deg_east':site['lon_deg_east'],'coordinate_frame_assumption':'MOON_ME_DE421'},
            'name_review':review[sid],'terrain':t,'slope_sample':sl,'long_term_visibility':v,'thermal':th,'resource_evidence':r,
            'horizon_metadata':load(f'metadata/terrain/{sid}_horizon_360deg.json'),
            'assets':{'horizon_csv':f'data/terrain/{sid}_horizon_360deg.csv','ephemeris_parquet':f'data/ephemeris/{sid}_hourly.parquet',
                'ephemeris_csv_gz':f'data/ephemeris/{sid}_hourly.csv.gz','geometry_frontend_week':f'data/ephemeris/{sid}_frontend_week.csv',
                'timeline_frontend_week':f'data/scenarios/{sid}_timeline_frontend_week.json','timeline_clps_parquet':f'data/scenarios/{sid}_timeline_clps_2p2m_hourly.parquet'},
            'provenance_files':['metadata/terrain/sources.json','metadata/environment/environment_manifest_fragment.json','metadata/ephemeris/ephemeris_manifest.json','metadata/catalog/source_manifest.json'],
            'quality_notes':['Proposal coordinate is preserved; scientific feature name may require correction.',
                             'Point summaries are sampled or modeled values at the stated source scale; no claim of in-situ measurement.',
                             'Water ice wt% and annual surface minimum temperature are intentionally unavailable.']}
        dossier.append(entry)
        flat.append({'site_id':sid,'proposal_label':site['proposal_name'],'lat_deg':site['lat_deg'],'lon_deg_east':site['lon_deg_east'],
            'name_review_status':review[sid]['status'],'elevation_above_1737400m_sphere_m':t['elevation_m'],'elevation_grid_spacing_m':t['native_grid_spacing_m'],
            'point_slope_deg':sl['slope_deg'],'slope_grid_spacing_m':sl['slope_grid_spacing_m'],
            'long_term_solar_any_disc_pct':None if v['solar_mean_fraction'] is None else v['solar_mean_fraction']*100,
            'long_term_earth_any_disc_pct':None if v['earth_mean_fraction'] is None else v['earth_mean_fraction']*100,
            'is_psr_pixel':None if v['psr_mask'] is None else int(v['psr_mask']),
            'distance_to_nearest_psr_pixel_center_m':v['nearest_psr_pixel_center_distance_m'],
            'modeled_annual_mean_2cm_K':th['thermal_annual_mean_at_2cm_K'],'modeled_annual_surface_max_K':th['thermal_annual_surface_max_K'],
            'annual_surface_min_K':None,'annual_surface_min_null_reason':th['annual_surface_min_null_reason'],
            'hydrogen_regional_ppm':r['hydrogen_ppm_by_weight'],'hydrogen_nominal_bin_size_km':60,'water_ice_wt_pct':None,
            'horizon_near_grid_spacing_m':80 if sid!='SHIV' else 240,
            'thermal_coverage_status':th['thermal_status'],'visibility_coverage_reason':v['coverage_reason'],
            'water_ice_null_reason':r['water_ice_wt_pct_null_reason']})
    write_json(ROOT/'data/catalog/site_dossiers.json',dossier)
    write_csv(ROOT/'data/catalog/site_summary.csv',flat)
    layers=[]
    for p in sorted((ROOT/'data').rglob('*.tif'))+sorted((ROOT/'data').rglob('*.TIF')):
        rel=p.relative_to(ROOT).as_posix();md=ROOT/'metadata/terrain'/f'{p.stem}.json'
        with rasterio.open(p) as s:
            rec={'path':rel,'width':s.width,'height':s.height,'bands':s.count,'dtypes':list(s.dtypes),
                'crs_wkt':s.crs.to_wkt(),'transform':list(s.transform)[:6],'bounds':list(s.bounds),
                'pixel_spacing_projection_units':list(s.res),'nodata':s.nodata,'scales':list(s.scales),'offsets':list(s.offsets),
                'role':'visual_basemap' if 'imagery/' in rel else 'quantitative_or_context_raster',
                'metadata_path':md.relative_to(ROOT).as_posix() if md.exists() else 'metadata/catalog/source_manifest.json'}
        layers.append(rec)
    write_json(ROOT/'data/catalog/raster_layer_index.json',layers)
    bootstrap={'pack_version':'1.0.0','body':'Moon','site_id_key':'site_id','units_contract':'docs/integration_contract.md',
        'sites':sites,'mission_profiles':load('data/catalog/mission_profiles.json'),'scenario_presets':load('data/catalog/scenario_presets.json'),
        'site_dossiers':dossier,'raster_layers':layers,'remote_wmts_layers':load('data/imagery/wmts_sources.json'),
        'scenario_comparison_file':'data/scenarios/scenario_comparison_presets.json',
        'data_status':{'full_catalog_terrain':True,'dynamic_geometry':True,'six_site_cached_horizons':True,
            'scenario_metrics':'preliminary; hourly center visibility and terrain-grid slope',
            'thermal':'polar model and selected seasonal observations; no annual minimum',
            'water_ice_wt_pct':False,'custom_coordinates':'source coverage is wider than prepared native-resolution site crops; regenerate data for new coordinates',
            'full_sensitivity_grid':False,'rover_route_solver':False}}
    write_json(ROOT/'data/app_bootstrap.json',bootstrap)
    print(json.dumps({'dossiers':len(dossier),'rasters':len(layers),'scenarios':len(scenarios),'bootstrap_bytes':(ROOT/'data/app_bootstrap.json').stat().st_size}))

if __name__=='__main__':main()
