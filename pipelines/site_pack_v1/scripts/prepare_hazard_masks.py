#!/usr/bin/env python3
"""Threshold native slope rasters at the proposal's fixed display limit15deg."""
import hashlib,json
from pathlib import Path
import numpy as np
import rasterio

ROOT=Path(__file__).resolve().parents[1]
sites=json.loads((ROOT/'data/catalog/sites.json').read_text())
for s in sites:
    sid=s['site_id']
    source=next((ROOT/'data/terrain').glob('C_site04_source_5m_slope_5m_6km.tif')) if sid=='C' else next((ROOT/'data/terrain').glob(f'{sid}_terrain_scale_slope_*m.tif'))
    target=ROOT/f'data/terrain/{sid}_slope_gt15deg_grid_mask.tif'
    with rasterio.open(source) as ds:
        a=ds.read(1,masked=True)
        mask=np.where(np.ma.getmaskarray(a),255,np.asarray(a)>15).astype('uint8')
        profile=ds.profile.copy();profile.update(dtype='uint8',nodata=255,predictor=2)
        with rasterio.open(target,'w',**profile) as out:
            out.write(mask,1);out.set_band_description(1,'Terrain-grid slope >15 degree; not lander-footprint hazard classification')
            out.write_colormap(1,{0:(0,0,0,0),1:(221,42,54,220),255:(0,0,0,0)})
            out.update_tags(source_slope=source.relative_to(ROOT).as_posix(),threshold_deg=15,rule='strictly_greater_than',scope='terrain-grid visualization only')
        rec={'path':target.relative_to(ROOT).as_posix(),'kind':'terrain_grid_slope_gt15deg_mask','source_slope_file':source.relative_to(ROOT).as_posix(),
            'source_slope_sha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'source_products':[],'unit':'boolean',
            'threshold_deg':15,'rule':'source slope in degrees >15; full native pixels; no overview thresholding',
            'classes':{'0':'slope<=15deg','1':'slope>15deg','255':'nodata'},'native_grid_spacing_m':ds.res[0],
            'limitations':'Fixed map display threshold from proposal; profile-specific maximum slope is separate. No lander-footprint hazard or boulder assessment.',
            'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest(),'hazard_pixels':int((mask==1).sum()),'valid_pixels':int((mask!=255).sum())}
    (ROOT/f'metadata/terrain/{target.stem}.json').write_text(json.dumps(rec,indent=2)+'\n')
    print(sid,rec['hazard_pixels'],'/',rec['valid_pixels'],flush=True)
