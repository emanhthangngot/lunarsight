#!/usr/bin/env python3
"""Generate reproducible lunar-site celestial geometry; no terrain occlusion model.

Run with a Python environment containing numpy, pandas, pyarrow and spiceypy.
Ground heights, if provided, are metres above the 1737400 m lunar sphere.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
import spiceypy as spice

ROOT = Path(__file__).resolve().parents[1]
KERNELS = ROOT / 'data/ephemeris/kernels'
OUT = ROOT / 'data/ephemeris'
META = ROOT / 'metadata/ephemeris'
SITES = {
    'A': (-89.24, 32.40), 'B': (-88.82, 12.10),
    'C': (-89.62, 178.30), 'D': (-85.91, 12.92),
    'E': (-85.22, 36.12), 'SHIV': (-69.37, 32.32),
}
KERNEL_URLS = {
    'de440s.bsp': 'spk/planets/de440s.bsp',
    'moon_pa_de440_200625.bpc': 'pck/moon_pa_de440_200625.bpc',
    'moon_de440_250416.tf': 'fk/satellites/moon_de440_250416.tf',
    'pck00011.tpc': 'pck/pck00011.tpc',
    'naif0012.tls': 'lsk/naif0012.tls',
}
EPOCHS = ['2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z', '2027-01-01T00:00:00Z']
RADIUS_KM = 1737.4
SUN_RADIUS_KM = 695700.0
EARTH_EQUATOR_RADIUS_KM = 6378.137
FRAME = 'MOON_ME'
ABCORR = 'CN+S'


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, allow_nan=False) + '\n')


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def load_kernels(download=True):
    rows = []
    KERNELS.mkdir(parents=True, exist_ok=True)
    for filename, rel in KERNEL_URLS.items():
        path = KERNELS / filename
        url = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/' + rel
        if not path.exists():
            if not download:
                raise FileNotFoundError(path)
            with urlopen(url, timeout=120) as response, path.open('wb') as out:
                while chunk := response.read(1024*1024):
                    out.write(chunk)
        spice.furnsh(str(path))
        rows.append({'filename': filename, 'source_url': url,
                     'bytes': path.stat().st_size,
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    dump(META / 'kernel_manifest.json', rows)
    return rows


def et_for_utc(value):
    # SPICE explicitly interprets UTC; time samples are uniform UTC wall-clock hours.
    return spice.str2et(pd.Timestamp(value).strftime('%Y-%m-%d %H:%M:%S') + ' UTC')


def observer_position(lat, lon, height_m):
    return spice.latrec(RADIUS_KM + height_m / 1000.0,
                        math.radians(lon), math.radians(lat))


def body_geometry(et, pos, target):
    state, _ = spice.azlcpo('ELLIPSOID', target, float(et), ABCORR,
                           False, True, pos, 'MOON', FRAME)
    # azccw=False means clockwise from north, elplsz=True means above local plane.
    return (math.degrees(state[1]) % 360.0, math.degrees(state[2]), float(state[0]))


def translate_radial_height(azimuth_deg, elevation_deg, range_km, delta_height_m):
    """Translate a cached apparent ray to a different radial observer height.

    Exact for a fixed target state and local frame. Apparent light-time/aberration
    dependencies are frozen; for full recomputation use geometry_for_site instead.
    Inputs may be numpy arrays. A numerical comparison for 0..15m is retained.
    """
    el = np.radians(elevation_deg)
    horizontal = range_km * np.cos(el)
    vertical = range_km * np.sin(el) - delta_height_m / 1000.0
    return (azimuth_deg, np.degrees(np.arctan2(vertical, horizontal)),
            np.hypot(horizontal, vertical))


def geometry_for_site(times, site_id, ground_height_m=0.0, mast_height_m=0.0,
                      ets=None):
    """Public helper: regenerate geometry at actual sampled ground/mast height."""
    lat, lon = SITES[site_id]
    pos = observer_position(lat, lon, ground_height_m + mast_height_m)
    if ets is None:
        ets = [et_for_utc(t) for t in times]
    values = np.empty((len(times), 6), dtype=np.float64)
    for n, et in enumerate(ets):
        values[n, :3] = body_geometry(et, pos, 'SUN')
        values[n, 3:] = body_geometry(et, pos, 'EARTH')
    df = pd.DataFrame(values, columns=[
        'sun_azimuth_deg', 'sun_elevation_deg', 'sun_range_km',
        'earth_azimuth_deg', 'earth_elevation_deg', 'earth_range_km'])
    df.insert(0, 'utc', pd.DatetimeIndex(times))
    df.insert(1, 'site_id', site_id)
    df['sun_angular_radius_deg'] = np.degrees(np.arcsin(SUN_RADIUS_KM / df.sun_range_km))
    df['earth_equatorial_angular_radius_deg'] = np.degrees(np.arcsin(EARTH_EQUATOR_RADIUS_KM / df.earth_range_km))
    df['observer_ground_height_m'] = ground_height_m
    df['observer_mast_height_m'] = mast_height_m
    return df


def make_context(times, ets):
    """Instantaneous geometric direction at Moon center; explicitly not apparent subpoints."""
    rows = []
    for et in ets:
        sun, _ = spice.spkpos('SUN', float(et), FRAME, 'NONE', 'MOON')
        earth, _ = spice.spkpos('EARTH', float(et), FRAME, 'NONE', 'MOON')
        _, slon, slat = spice.reclat(sun)
        _, elon, elat = spice.reclat(earth)
        rows.append((math.degrees(slon) % 360, math.degrees(slat),
                     math.degrees(elon) % 360, math.degrees(elat)))
    df = pd.DataFrame(rows, columns=['subsolar_geometric_longitude_deg_east',
                                     'subsolar_geometric_latitude_deg',
                                     'subearth_geometric_longitude_deg_east',
                                     'subearth_geometric_latitude_deg'])
    df.insert(0, 'utc', times)
    df.to_parquet(OUT / 'lunar_context_hourly.parquet', index=False, compression='zstd')
    df.to_csv(OUT / 'lunar_context_hourly.csv.gz', index=False, compression='gzip', float_format='%.10f')
    return df


def fetch_fixture(site_id, target_id, user_agent):
    lat, lon = SITES[site_id]
    jd = [pd.Timestamp(t).timestamp() / 86400.0 + 2440587.5 for t in EPOCHS]
    params = {'format': 'text', 'COMMAND': f"'{target_id}'", 'OBJ_DATA': "'NO'",
              'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'",
              'CENTER': "'coord@301'", 'COORD_TYPE': "'GEODETIC'",
              'SITE_COORD': f"'{lon},{lat},0'", 'TLIST': "'" + ','.join(map(str, jd)) + "'",
              'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'UT'", 'QUANTITIES': "'4,13,20'",
              'RANGE_UNITS': "'KM'", 'CSV_FORMAT': "'YES'", 'EXTRA_PREC': "'YES'"}
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urlencode(params)
    path = META / 'horizons_raw' / f'{site_id}_{target_id}_datum0.txt'
    info_path = path.with_suffix('.request.json')
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        # Intentionally sequential: SSD fair-use policy forbids concurrent API calls.
        with urlopen(Request(url, headers={'User-Agent': user_agent}), timeout=90) as response:
            content = response.read().decode('utf-8')
            status = response.status
        if '$$SOE' not in content or '$$EOE' not in content:
            raise RuntimeError(f'Invalid Horizons response {site_id} {target_id}: {content[:500]}')
        path.write_text(content)
        dump(info_path, {'url': url, 'parameters': params, 'http_status': status,
                         'retrieved_utc': utcnow(), 'user_agent': user_agent,
                         'site_height_m': 0.0, 'cache_policy': 'reuse existing response; no repeat query'})
    return path


def validate(user_agent):
    rows = []
    for site_id in SITES:
        lat, lon = SITES[site_id]
        pos = observer_position(lat, lon, 0)
        for target_id, target in [('10', 'SUN'), ('399', 'EARTH')]:
            path = fetch_fixture(site_id, target_id, user_agent)
            text = path.read_text()
            raw_rows = list(csv.reader(io.StringIO(text.split('$$SOE')[1].split('$$EOE')[0].strip())))
            if len(raw_rows) != len(EPOCHS):
                raise RuntimeError(f'Expected {len(EPOCHS)} reference rows in {path}, got {len(raw_rows)}')
            for epoch, r in zip(EPOCHS, raw_rows):
                actual_epoch = pd.to_datetime(r[0].strip(), format='%Y-%b-%d %H:%M:%S.%f', utc=True)
                if actual_epoch != pd.Timestamp(epoch):
                    raise RuntimeError(f'Epoch mismatch: {actual_epoch} vs {epoch}')
                ref_az, ref_el, ref_diameter_arcsec, ref_range = map(float, r[3:7])
                az, el, distance = body_geometry(et_for_utc(epoch), pos, target)
                az_res = (az - ref_az + 180) % 360 - 180
                el_res = el - ref_el
                row = {'site_id': site_id, 'target': target, 'utc': epoch,
                       'reference_azimuth_deg': ref_az, 'computed_azimuth_deg': az,
                       'azimuth_residual_deg': az_res,
                       'reference_elevation_deg': ref_el, 'computed_elevation_deg': el,
                       'elevation_residual_deg': el_res,
                       'reference_range_km': ref_range, 'computed_range_km': distance,
                       'range_residual_km': distance - ref_range,
                       'reference_angular_diameter_arcsec': ref_diameter_arcsec,
                       'reference_file': str(path.relative_to(ROOT))}
                radius = SUN_RADIUS_KM if target == 'SUN' else EARTH_EQUATOR_RADIUS_KM
                row['computed_equatorial_angular_diameter_arcsec'] = math.degrees(2 * math.asin(radius / distance)) * 3600
                row['angular_diameter_residual_arcsec'] = row['computed_equatorial_angular_diameter_arcsec'] - ref_diameter_arcsec
                row['passes'] = (abs(az_res) <= 0.0001 and abs(el_res) <= 0.0001 and
                                 abs(distance-ref_range) <= 0.1 and
                                 abs(row['angular_diameter_residual_arcsec']) <= 0.01)
                rows.append(row)
    df = pd.DataFrame(rows)
    df.to_csv(META / 'horizons_validation.csv', index=False)
    summary = {'generated_utc': utcnow(), 'reference_epochs_utc': EPOCHS,
               'number_of_comparisons': len(rows), 'number_of_raw_requests': 12,
               'all_pass': bool(df.passes.all()),
               'tolerances': {'azimuth_deg': 0.0001, 'elevation_deg': 0.0001, 'range_km': 0.1,
                              'angular_diameter_arcsec': 0.01},
               'max_abs_residual': {c: float(df[c].abs().max()) for c in
                                    ['azimuth_residual_deg', 'elevation_residual_deg', 'range_residual_km',
                                     'angular_diameter_residual_arcsec']},
               'comparison_definitions': {'our_model': 'DE440 + CN+S; no gravitational light bending',
                    'horizons_model': 'as reported in retained response header; apparent airless coordinates',
                    'angular_diameter': 'equatorial spherical angular diameter; gate checks this convention only, not resolved Earth limb'},
               'limitation': 'These cross-model fixture checks establish agreement at the stated epochs, not flight qualification or terrain-shadow accuracy.'}
    dump(META / 'validation_summary.json', summary)
    if not summary['all_pass']:
        raise RuntimeError('Horizons validation failed; inspect metadata/ephemeris/horizons_validation.csv')
    return summary


def validate_subpoints(user_agent):
    """Product JPL-panel reference table; separate from geometric NONE context."""
    params = {'format': 'text', 'COMMAND': "'301'", 'OBJ_DATA': "'NO'",
              'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'",
              'TLIST': "'2461041.5,2461222.5,2461406.5'", 'TLIST_TYPE': "'JD'",
              'TIME_TYPE': "'UT'", 'QUANTITIES': "'14,15'", 'CSV_FORMAT': "'YES'",
              'EXTRA_PREC': "'YES'"}
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urlencode(params)
    path = META / 'horizons_raw/MOON_subpoints_from_EARTH.txt'
    if not path.exists():
        with urlopen(Request(url, headers={'User-Agent': user_agent}), timeout=90) as response:
            text = response.read().decode()
        if '$$SOE' not in text:
            raise RuntimeError('Missing Horizons subpoint table')
        path.write_text(text)
    text = path.read_text()
    dump(path.with_suffix('.request.json'), {'url': url, 'parameters': params,
         'cache_policy': 'reuse raw response; no duplicate requests',
         'retrieved_utc': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
         'description': 'Moon apparent observer/subsolar subpoints seen from Earth center'})
    table = list(csv.reader(io.StringIO(text.split('$$SOE')[1].split('$$EOE')[0].strip())))
    if len(table) != 3:
        raise RuntimeError('Incorrect number of subpoint epochs')
    rows = []
    for epoch, r in zip(EPOCHS, table):
        if pd.to_datetime(r[0].strip(), format='%Y-%b-%d %H:%M:%S.%f', utc=True) != pd.Timestamp(epoch):
            raise RuntimeError('Subpoint reference epoch mismatch')
        reference = list(map(float, r[3:7]))
        et = et_for_utc(epoch)
        ep, _, _ = spice.subpnt('Intercept: ellipsoid', 'MOON', et, FRAME, 'CN', 'EARTH')
        sp, _, _ = spice.subslr('Intercept: ellipsoid', 'MOON', et, FRAME, 'CN+S', 'EARTH')
        _, elon, elat = spice.reclat(ep)
        _, slon, slat = spice.reclat(sp)
        computed = [math.degrees(elon)%360, math.degrees(elat), math.degrees(slon)%360, math.degrees(slat)]
        for idx, name in enumerate(['subearth_longitude_deg_east', 'subearth_latitude_deg',
                                    'subsolar_longitude_deg_east', 'subsolar_latitude_deg']):
            residual = computed[idx] - reference[idx]
            if 'longitude' in name:
                residual = (residual + 180) % 360 - 180
            rows.append({'utc': epoch, 'quantity': name, 'reference_value_deg': reference[idx],
                         'computed_value_deg': computed[idx], 'residual_deg': residual,
                         'fixture_gate_deg': 0.0001, 'passes': abs(residual) <= 0.0001,
                         'reference_file': str(path.relative_to(ROOT)),
                         'computed_method': 'subpnt Intercept:ellipsoid CN' if idx < 2 else 'subslr Intercept:ellipsoid CN+S'})
    df = pd.DataFrame(rows)
    df.to_csv(META / 'subpoint_benchmarks.csv', index=False)
    summary = {'comparisons': len(df), 'all_pass': bool(df.passes.all()),
               'fixture_gate_deg': 0.0001, 'max_abs_residual_deg': float(df.residual_deg.abs().max()),
               'context_NONE_columns_validated_by_this_test': False,
               'definitions': 'Apparent Moon subpoints at Earth observer print-time; subpnt uses reception light time CN; subslr uses CN+S; no gravitational light bending. Geometric NONE context columns remain a different product.'}
    dump(META / 'subpoint_validation_summary.json', summary)
    if not summary['all_pass']:
        raise RuntimeError('Subpoint fixture gate failed')
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--start', default='2025-12-01T00:00:00Z')
    p.add_argument('--stop', default='2030-02-01T00:00:00Z', help='inclusive final hourly sample')
    default_heights = META / 'observer_ground_heights.json'
    p.add_argument('--heights-json', type=Path, default=default_heights if default_heights.exists() else None,
                   help='JSON site_id -> height m, or list of terrain height records above 1737400m sphere')
    p.add_argument('--mast-height-m', type=float, default=0.0)
    p.add_argument('--skip-validation', action='store_true')
    p.add_argument('--validate-only', action='store_true')
    p.add_argument('--user-agent', default='ChatGPT-LunarSight-DataPreparation/1.0 (+https://help.openai.com/)')
    args = p.parse_args()
    for folder in [OUT, META]:
        folder.mkdir(parents=True, exist_ok=True)
    kernels = load_kernels()
    validation = None if args.skip_validation else validate(args.user_agent)
    subpoint_validation = None if args.skip_validation else validate_subpoints(args.user_agent)
    if args.validate_only:
        print(json.dumps(validation, indent=2)); return
    heights = json.loads(args.heights_json.read_text()) if args.heights_json else {s: 0.0 for s in SITES}
    if isinstance(heights, list):
        for site in heights:
            if site.get('reference_radius_m') != RADIUS_KM * 1000:
                raise ValueError('Ground height reference radius does not match geometry sphere')
        heights = {r['site_id']: r['elevation_m'] for r in heights}
    if set(heights) != set(SITES):
        raise ValueError('Height mapping must contain all six site IDs exactly')
    times = pd.date_range(args.start, args.stop, freq='h')
    ets = np.array([et_for_utc(t) for t in times])
    make_context(times, ets)
    records = []
    for site_id in SITES:
        df = geometry_for_site(times, site_id, float(heights[site_id]), args.mast_height_m, ets)
        path = OUT / f'{site_id}_hourly.parquet'
        df.to_parquet(path, index=False, compression='zstd')
        df.to_csv(OUT / f'{site_id}_hourly.csv.gz', index=False, compression='gzip', float_format='%.10f')
        preview = df[(df.utc >= '2026-01-01') & (df.utc < '2026-01-08')]
        preview.to_csv(OUT / f'{site_id}_frontend_week.csv', index=False, float_format='%.8f')
        sample = preview.iloc[::6].copy()
        sample['utc'] = sample.utc.dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        dump(OUT / f'{site_id}_sample.json', sample.to_dict(orient='records'))
        records.append({'site_id': site_id, 'latitude_deg': SITES[site_id][0],
                        'longitude_deg_east': SITES[site_id][1], 'rows': len(df),
                        'ground_height_m': float(heights[site_id]),
                        'mast_height_m': args.mast_height_m,
                        'parquet': str(path.relative_to(ROOT)), 'parquet_bytes': path.stat().st_size})
        print(f'{site_id}: {len(df):,} hourly rows', flush=True)
    manifest = {'generated_utc': utcnow(), 'software': {'python': platform.python_version(),
                'spiceypy': spice.__version__, 'numpy': np.__version__, 'pandas': pd.__version__},
                'coverage': {'start_utc': times[0].isoformat(), 'stop_utc_inclusive': times[-1].isoformat(),
                             'cadence_seconds': 3600, 'rows_per_site': len(times), 'total_rows': len(times)*6,
                             'mission_integration': 'Use half-open [start,end); final sample is interpolation boundary.'},
                'observer': {'frame': FRAME, 'reference_sphere_radius_km': RADIUS_KM,
                             'height_source': str(args.heights_json) if args.heights_json else 'explicit reference datum 0; no sampled ground elevation',
                             'height_datum': 'metres above 1737400m sphere', 'mast_height_m': args.mast_height_m},
                'apparent_geometry': {'correction': ABCORR, 'atmospheric_refraction': False,
                                     'gravitational_light_bending': False,
                                     'azimuth_convention': 'north=0 east=90 south=180 west=270',
                                     'elevation_convention': 'positive above local ellipsoid normal horizon plane',
                                     'earth_target': 'center of Earth; no specific ground station',
                                     'sun_target': 'center of Sun',
                                     'sun_angular_radius': 'asin(695700km/range)',
                                     'earth_angular_radius': 'asin(6378.137km/range), equatorial spherical bound, not resolved apparent ellipse'},
                'terrain_occlusion_included': False,
                'context': {'file': 'data/ephemeris/lunar_context_hourly.parquet',
                            'definition': 'Instantaneous geometric Moon-center to Sun/Earth vectors in MOON_ME, aberration NONE. Lat/lon of the directions, not topocentric az/el or apparent observer-time subpoints.',
                            'earth_libration_label': 'subearth_geometric_latitude_deg is geometric optical libration in latitude in the selected frame; not a station elevation.'},
                'sites': records, 'kernels': kernels, 'validation': validation,
                'subpoint_validation': subpoint_validation,
                'schema': {c: {'unit': ('UTC timestamp' if c=='utc' else 'identifier' if c=='site_id' else
                                      'km' if c.endswith('_km') else 'm' if c.endswith('_m') else 'degree'),
                               'dtype': str(t)} for c,t in df.dtypes.items()},
                'sources': ['https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/azlcpo_c.html',
                            'https://ssd.jpl.nasa.gov/horizons/manual.html',
                            'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
                            'https://ssd-api.jpl.nasa.gov/doc/']}
    dump(META / 'ephemeris_manifest.json', manifest)
    print(f'COMPLETE {len(times)*6:,} rows', flush=True)


if __name__ == '__main__':
    main()
