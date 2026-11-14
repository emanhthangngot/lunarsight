"""Independently verify local seam quality aggregation with GDAL area averaging."""
from pathlib import Path
import csv,json,hashlib,math
import numpy as np
from rasterio.transform import Affine
from rasterio.warp import reproject,Resampling
P=Path('notebooks/evidence/site04-case');A=Path('artifacts/site04-seam-quality');E=json.loads((P/'seam-quality-metadata.json').read_text());rows=list(csv.DictReader((P/'seam-quality.csv').open()))
assert len(rows)==E['pixels']==111
assert hashlib.sha256((P/'seam-quality.csv').read_bytes()).hexdigest()==E['output_sha256']
arrays={};meta={}
for source in E['sources']:
 k=source['layer']
 with np.load(A/(k+'.npz'),allow_pickle=False) as f:
  data=f['data'];loc=json.loads(str(f['metadata']))
 assert hashlib.sha256(np.ascontiguousarray(data,dtype='<f4').tobytes()).hexdigest()==loc['window_sha256']==source['window_sha256']
 arrays[k]=data;meta[k]=loc
m=meta['5m_count'];w=m['window'];src=Affine(*m['source_transform'])*Affine.translation(w[0],w[1]);m80=meta['80m_count'];w80=m80['window'];dst=Affine(*m80['source_transform'])*Affine.translation(w80[0],w80[1]);crs=m['source_crs_wkt'];shape=arrays['80m_count'].shape
assert meta['5m_zrms']['window']==w
checks=[('area_5m_positive_fraction',np.where(np.isfinite(arrays['5m_count']),(arrays['5m_count']>0).astype('float32'),np.nan)),('area_mean_5m_zrms_m',arrays['5m_zrms'])]
for field,values in checks:
 out=np.full(shape,np.nan,dtype='float32')
 reproject(source=values,destination=out,src_transform=src,src_crs=crs,src_nodata=np.nan,dst_transform=dst,dst_crs=crs,dst_nodata=np.nan,resampling=Resampling.average)
 errs=[]
 for item in rows:
  c,r=(~dst)*(float(item['x80_m']),float(item['y80_m']));v=float(out[math.floor(r),math.floor(c)]);errs.append(abs(v-float(item[field])))
 assert len(errs)==111 and max(errs)<1e-4
 print(field,'GDAL cross-check max absolute difference',max(errs))
for item in rows:
 c,r=(~dst)*(float(item['x80_m']),float(item['y80_m']));i,j=math.floor(r),math.floor(c)
 for k in ('80m_count','80m_effres','80m_zerr'):
  assert abs(float(item[k])-float(arrays[k][i,j]))<1e-6
assert all(float(x['area_5m_count_valid_m2'])==6400 and float(x['area_5m_zrms_valid_m2'])==6400 for x in rows)
print('All 111 source-grid locations and quality fields verified; datum and effective-kernel identity not verified.')
