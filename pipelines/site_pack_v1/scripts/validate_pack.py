#!/usr/bin/env python3
"""Validate a LunarSight data pack without fetching data or changing inputs."""
from pathlib import Path
import argparse,ast,hashlib,json,datetime
import numpy as np
import pandas as pd
import rasterio
from pyproj import CRS

ROOT=Path(__file__).resolve().parents[1]

def strict_json(path):
    def invalid(value):raise ValueError(f'Non-standard JSON numeric constant {value}: {path}')
    return json.loads(path.read_text(encoding='utf-8'),parse_constant=invalid)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--write-report',action='store_true');ap.add_argument('--skip-checksums',action='store_true');args=ap.parse_args()
    counts={};checks=[]
    jsons=list(ROOT.rglob('*.json'))
    for p in jsons:strict_json(p)
    counts['json_files']=len(jsons);checks.append('Every JSON parses with NaN/Infinity rejected')
    for p in (ROOT/'scripts').glob('*.py'):ast.parse(p.read_text(encoding='utf-8'),filename=str(p))
    checks.append('All delivered Python scripts parse')
    sites=strict_json(ROOT/'data/catalog/sites.json');ids={s['site_id'] for s in sites}
    assert ids=={'A','B','C','D','E','SHIV'} and len(sites)==6
    assert len(strict_json(ROOT/'data/catalog/mission_profiles.json'))==5
    counts['sites']=len(sites);counts['profiles']=5
    dossiers=strict_json(ROOT/'data/catalog/site_dossiers.json')
    assert {d['site_id'] for d in dossiers}==ids
    for d in dossiers:
        for path in list(d['assets'].values())+d['provenance_files']:assert (ROOT/path).is_file(),path
        assert d['resource_evidence']['water_ice_wt_pct'] is None
        assert d['thermal']['thermal_annual_surface_min_K'] is None
        if d['site_id']=='SHIV':
            assert d['long_term_visibility']['solar_mean_fraction'] is None
            assert d['thermal']['thermal_annual_surface_max_K'] is None
    checks.append('Catalog joins, dossier paths and unavailable-field semantics agree')
    rasters=strict_json(ROOT/'data/catalog/raster_layer_index.json')
    for rec in rasters:
        p=ROOT/rec['path'];assert p.is_file()
        with rasterio.open(p) as s:
            assert abs(CRS(s.crs).ellipsoid.semi_major_metre-1737400)<1e-3
            assert (s.width,s.height)==(rec['width'],rec['height'])
            if 'slope_gt15deg_grid_mask' in p.name:
                m=strict_json(ROOT/f'metadata/terrain/{p.stem}.json')
                with rasterio.open(ROOT/m['source_slope_file']) as source:
                    a=source.read(1,masked=True);mask=s.read(1)
                    expected=np.where(np.ma.getmaskarray(a),255,np.asarray(a)>15).astype('uint8')
                    assert np.array_equal(mask,expected)
    counts['raster_files']=len(rasters);counts['quantitative_or_context_rasters']=sum(r['role']!='visual_basemap' for r in rasters)
    checks.append('Raster headers use lunar radius and match index; six15deg masks exactly match native slope thresholds')
    ephrows=0;timerows=0;horizonrows=0
    for sid in sorted(ids):
        ep=pd.read_parquet(ROOT/f'data/ephemeris/{sid}_hourly.parquet')
        assert len(ep)==36553 and not ep.utc.duplicated().any()
        assert (ep.utc.diff().iloc[1:]==pd.Timedelta(hours=1)).all()
        h=pd.read_csv(ROOT/f'data/terrain/{sid}_horizon_360deg.csv')
        assert len(h)==2160 and np.isfinite(h.terrain_horizon_elevation_deg).all()
        hm=strict_json(ROOT/f'metadata/terrain/{sid}_horizon_360deg.json')
        assert np.allclose(ep.observer_ground_height_m,hm['ground_elevation_m'],rtol=0,atol=1e-7)
        ts=pd.read_parquet(ROOT/f'data/scenarios/{sid}_timeline_clps_2p2m_hourly.parquet')
        assert len(ts)==36552
        assert np.array_equal(ts.simultaneous_center_visible,ts.sun_center_visible & ts.earth_center_visible)
        assert np.array_equal(ts.utc.to_numpy(),ep.utc.iloc[:-1].to_numpy())
        ephrows+=len(ep);timerows+=len(ts);horizonrows+=len(h)
    counts.update(site_time_ephemeris_rows=ephrows,default_timeline_rows=timerows,horizon_rows=horizonrows)
    checks.append('Six ephemeris/timeline/horizon components share IDs, UTC grid, observer heights and visibility intersections')
    records=strict_json(ROOT/'data/scenarios/scenario_comparison_presets.json')
    assert len(records)==150 and len({r['scenario_id'] for r in records})==150
    for r in records:
        s,e,b=[r[k]/100 for k in ['sunlight_center_pct','earth_center_visibility_pct','simultaneous_center_pct']]
        assert max(0,s+e-1)-1e-12<=b<=min(s,e)+1e-12
        hours=int((pd.Timestamp(r['end_utc_exclusive'])-pd.Timestamp(r['start_utc'])).total_seconds()/3600)
        assert hours==r['window_hours']
        for key in ['sunlight_center_hours','earth_center_visible_hours','simultaneous_center_hours','max_darkness_within_window_hours','max_blackout_within_window_hours']:
            assert 0<=r[key]<=hours
    counts['scenario_records']=len(records);checks.append('150 scenario intervals and overlap/duration bounds are consistent')
    echeck=strict_json(ROOT/'metadata/environment/environment_validation.json')
    tcheck=strict_json(ROOT/'metadata/terrain/validation.json')
    gcheck=strict_json(ROOT/'metadata/ephemeris/validation_summary.json')
    assert echeck['status']==tcheck['status']=='passed' and gcheck['all_pass']
    seasonal=pd.read_csv(ROOT/'data/environment/thermal/site_seasonal_temperature_samples.csv')
    assert len(seasonal)==72
    counts['seasonal_rows']=72;counts['seasonal_valid_rows']=echeck['seasonal_valid_rows'];counts['seasonal_null_rows']=echeck['seasonal_null_rows']
    checks.append('Component validation reports passed; retained seasonal sample counts agree')
    sums=ROOT/'checksums.sha256';verified=0
    if sums.exists() and not args.skip_checksums:
        for line in sums.read_text().splitlines():
            expected,rel=line.split('  ',1);p=ROOT/rel
            with p.open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
            assert actual==expected,f'Checksum mismatch: {rel}'
            verified+=1
        checks.append(f'All {verified} release file checksums matched')
    report={'status':'passed','checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':counts,'checks':checks,
        'checksum_files_verified_this_run':verified,
        'scope':'Data integrity, schema and implementation consistency. Source scientific limitations remain; no flight or mission-safety certification.'}
    if args.write_report:
        (ROOT/'metadata/pack_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
