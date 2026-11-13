#!/usr/bin/env python3
"""Build explicitly preliminary, hourly terrain-screened scenario caches.

Inputs are real-data components prepared by the other scripts. This is a
screening example, not a lander hazard assessment or radio/power model.
"""
from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import pandas as pd
import rasterio
from pyproj import CRS, Transformer

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/scenarios'

def dump(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')

def states(ephemeris,horizon,mast):
    """Translate cached apparent vector radially to mast, then screen its centre.

    Recomputing light time and aberration for metre-sized mast changes is not
    included in this vector translation. This approximation is far smaller than
    the hourly / 1-degree horizon / 80-240m terrain sampling limitations.
    """
    h=horizon[np.isclose(horizon.observer_height_above_ground_m,mast)].sort_values('azimuth_deg')
    if len(h)!=360 or not np.array_equal(h.azimuth_deg.to_numpy(),np.arange(360)):
        raise ValueError(f'Incomplete horizon for mast={mast}')
    result=pd.DataFrame({'utc':ephemeris.utc,'site_id':ephemeris.site_id})
    for body,radius in [('sun',695700.0),('earth',6378.137)]:
        az=ephemeris[f'{body}_azimuth_deg'].to_numpy()
        el=np.radians(ephemeris[f'{body}_elevation_deg'].to_numpy())
        r=ephemeris[f'{body}_range_km'].to_numpy()
        delta=(mast-ephemeris.observer_mast_height_m.to_numpy())/1000
        horizontal=r*np.cos(el);vertical=r*np.sin(el)-delta
        elevated=np.degrees(np.arctan2(vertical,horizontal))
        newrange=np.hypot(horizontal,vertical)
        angular_radius=np.degrees(np.arcsin(radius/newrange))
        terrain=np.interp(az,h.azimuth_deg,h.terrain_horizon_elevation_deg,period=360)
        if not np.isfinite(elevated+terrain).all():raise ValueError('Non-finite geometry')
        result[f'{body}_elevation_at_mast_approx_deg']=elevated
        result[f'{body}_horizon_at_center_azimuth_deg']=terrain
        result[f'{body}_center_visible']=elevated>terrain
        result[f'{body}_upper_limb_visible_approx']=elevated+angular_radius>terrain
    result['simultaneous_center_visible']=result.sun_center_visible & result.earth_center_visible
    result['mast_height_m']=mast
    return result

def max_false_hours(values):
    a=~np.asarray(values,dtype=bool)
    edges=np.flatnonzero(np.diff(np.r_[False,a,False].astype('int8')))
    return int((edges[1::2]-edges[::2]).max()) if len(edges) else 0

def sample_best_slope(site):
    sid=site['site_id']
    candidates=list((ROOT/'data/terrain').glob(f'{sid}_site04_source_5m_slope_5m_6km.tif')) if sid=='C' else []
    if not candidates:candidates=list((ROOT/'data/terrain').glob(f'{sid}_terrain_scale_slope_*m.tif'))
    if len(candidates)!=1:raise ValueError(f'Unresolved slope source for {sid}: {candidates}')
    path=candidates[0]
    with rasterio.open(path) as s:
        tr=Transformer.from_crs(CRS(s.crs).geodetic_crs,s.crs,always_xy=True)
        x,y=tr.transform(site['lon_deg_east'],site['lat_deg'])
        value=float(next(s.sample([(x,y)],masked=True))[0])
        if not math.isfinite(value) or value==s.nodata:raise ValueError(f'Missing slope {sid}')
        return {'slope_deg':value,'slope_grid_spacing_m':float(s.res[0]),'slope_source':str(path.relative_to(ROOT)),
                'slope_sampling_method':'nearest pixel containing exact proposal coordinate; no lander-footprint analysis'}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    sites=json.loads((ROOT/'data/catalog/sites.json').read_text())
    profiles=json.loads((ROOT/'data/catalog/mission_profiles.json').read_text())
    presets=json.loads((ROOT/'data/catalog/scenario_presets.json').read_text())
    records=[];timeline_records=[];slope_records=[];event_records=[]
    for site in sites:
        sid=site['site_id']
        ep=pd.read_parquet(ROOT/f'data/ephemeris/{sid}_hourly.parquet')
        ep['utc']=pd.to_datetime(ep.utc,utc=True)
        if not ep.utc.is_monotonic_increasing or ep.utc.duplicated().any():raise ValueError('Invalid UTC order')
        if not (ep.utc.diff().iloc[1:]==pd.Timedelta(hours=1)).all():raise ValueError('Gap in hourly cache')
        hz=pd.read_csv(ROOT/f'data/terrain/{sid}_horizon_360deg.csv')
        hm=json.loads((ROOT/f'metadata/terrain/{sid}_horizon_360deg.json').read_text())
        if not np.allclose(ep.observer_ground_height_m,hm['ground_elevation_m'],atol=1e-7,rtol=0):
            raise ValueError(f'Geometry/horizon ground mismatch {sid}')
        slope=sample_best_slope(site);slope_records.append({'site_id':sid,**slope})
        cache={}
        for profile in profiles:
            mast=profile['mast_height_m']
            if mast not in cache:cache[mast]=states(ep,hz,mast)
            ts=cache[mast]
            for startstr in presets['landing_dates_utc']:
                start=pd.Timestamp(startstr);end=start+pd.DateOffset(months=profile['default_duration_months'])
                w=ts[(ts.utc>=start)&(ts.utc<end)]
                expected=int((end-start).total_seconds()/3600)
                if len(w)!=expected:raise ValueError(f'Incomplete scenario interval {sid}')
                sun=w.sun_center_visible.to_numpy();earth=w.earth_center_visible.to_numpy();both=sun&earth
                sf=float(sun.mean());ef=float(earth.mean());bf=float(both.mean())
                if not max(0,sf+ef-1)-1e-12<=bf<=min(sf,ef)+1e-12:raise AssertionError('Impossible overlap')
                dark=max_false_hours(sun);blackout=max_false_hours(earth)
                passes={'min_sunlight':sf*100>=profile['min_sunlight_pct'],
                        'max_darkness':dark<=profile['max_darkness_hours'],
                        'min_earth_visibility':ef*100>=profile['min_earth_visibility_pct'],
                        'max_blackout':blackout<=profile['max_blackout_hours'],
                        'max_terrain_scale_slope':slope['slope_deg']<=profile['max_slope_deg']}
                records.append({'scenario_id':f"{sid}_{profile['profile_id']}_{start.strftime('%Y%m%d')}",
                    'site_id':sid,'profile_id':profile['profile_id'],'start_utc':start.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'end_utc_exclusive':end.strftime('%Y-%m-%dT%H:%M:%SZ'),'duration_months':profile['default_duration_months'],
                    'mast_height_m':mast,'sample_hours':1,'window_hours':expected,
                    'sunlight_center_pct':sf*100,'sunlight_center_hours':int(sun.sum()),
                    'earth_center_visibility_pct':ef*100,'earth_center_visible_hours':int(earth.sum()),
                    'simultaneous_center_pct':bf*100,'simultaneous_center_hours':int(both.sum()),
                    'max_darkness_within_window_hours':dark,'max_blackout_within_window_hours':blackout,
                    'window_begins_in_darkness':not bool(sun[0]),'window_ends_in_darkness':not bool(sun[-1]),
                    'window_begins_in_blackout':not bool(earth[0]),'window_ends_in_blackout':not bool(earth[-1]),
                    **slope,'constraint_results':passes,'passed_constraints_count':sum(passes.values()),
                    'screen_status':'thresholds_met_at_sampled_resolution' if all(passes.values()) else 'one_or_more_thresholds_failed_at_sampled_resolution',
                    'assessment_kind':'preliminary_sampled_geometry_and_terrain_screen',
                    'visibility_rule':'body center elevation > interpolated terrain horizon at center azimuth'})
        default=cache[2.2].iloc[:-1].copy()  # Last ephemeris sample is only an interval boundary.
        pp=OUT/f'{sid}_timeline_clps_2p2m_hourly.parquet'
        default.to_parquet(pp,index=False,compression='zstd')
        preview=default[(default.utc>='2026-01-01')&(default.utc<'2026-01-08')].copy()
        preview['utc']=preview.utc.dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        dump(OUT/f'{sid}_timeline_frontend_week.json',preview.to_dict(orient='records'))
        preview.to_csv(OUT/f'{sid}_timeline_frontend_week.csv',index=False)
        for body in ['sun','earth']:
            arr=default[f'{body}_center_visible'].to_numpy()
            for i in np.flatnonzero(arr[1:]!=arr[:-1])+1:
                event_records.append({'site_id':sid,'body':body,'mast_height_m':2.2,
                    'event':'center_becomes_visible' if arr[i] else 'center_becomes_obstructed',
                    'bracket_start_utc':default.utc.iloc[i-1].strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'first_changed_sample_utc':default.utc.iloc[i].strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'event_time_precision':'bracketed by consecutive hourly samples; sub-hour transitions may be missed'})
        timeline_records.append({'site_id':sid,'rows':len(default),'mast_height_m':2.2,'path':str(pp.relative_to(ROOT)),
            'start_utc':default.utc.iloc[0].isoformat(),'end_utc_exclusive':ep.utc.iloc[-1].isoformat()})
        print(f'{sid}: {len(default):,} timeline rows; 25 scenarios',flush=True)
    dump(OUT/'scenario_comparison_presets.json',records)
    flat=[{**{k:v for k,v in r.items() if k!='constraint_results'},**{f'passes_{k}':v for k,v in r['constraint_results'].items()}} for r in records]
    pd.DataFrame(flat).to_csv(OUT/'scenario_comparison_presets.csv',index=False)
    pd.DataFrame(slope_records).to_csv(ROOT/'data/terrain/site_slope_samples.csv',index=False)
    pd.DataFrame(event_records).to_csv(OUT/'visibility_transitions_clps_2p2m.csv',index=False)
    dump(ROOT/'metadata/scenarios/method.json',{
        'scenario_count':len(records),'timeline_files':timeline_records,'transition_brackets_count':len(event_records),
        'inputs':['data/ephemeris/*_hourly.parquet','data/terrain/*_horizon_360deg.csv','data/catalog/mission_profiles.json','data/catalog/scenario_presets.json'],
        'time_interpretation':'Each sample represents the following1-hour interval; all scenario ends excluded; duration is calendar months.',
        'visibility':'Center of body above terrain horizon. Upper-limb proxy also supplied, using horizon at center azimuth only; it is not a full finite-disc occultation calculation.',
        'mast_adjustment':'Radial translation of cached apparent Sun/Earth vectors from cached observer height to selected mast; light time and stellar aberration are not recomputed for this metre-scale translation.',
        'horizon':'1-degree azimuth samples, bilinear native80m terrain within20km at polar sites, native240m farther away, 200km maximum ray range. Periodic linear azimuth interpolation.',
        'slope':'Best supplied point-pixel slope: source5m atC, derived80m atA/B/D/E and240m atSHIV. No lander-footprint hazard analysis.',
        'limits':['A sampled visibility estimate, not a full energy or radio link model.','Temporal steps can miss shorter windows or eclipses; this cache does not model lunar eclipses or distant occulting bodies.','Finite terrain radius and coarse grids can miss obstructions.','Window-clipped longest runs do not establish the full duration of an event that starts before or ends after the chosen interval.','Do not compare directly to long-term mean maps that use different epochs, sampling and visible-disc definitions.'],
        'qa':{'unique_scenarios':len({r['scenario_id'] for r in records})==len(records),'overlap_inequality_checked':True,'all_time_windows_complete':True,'ground_height_matches_horizon':True}})

if __name__=='__main__':main()
