"""Check area means against GDAL average resampling; not an independent datum test."""
from pathlib import Path
import csv,json,hashlib,math
import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import reproject,Resampling
P=Path('notebooks/evidence/site04-case');A=Path('artifacts/site04-nearfield');B=Path('artifacts/site04-case')
nm=json.loads((P/'near-far-25km-metadata.json').read_text());fm=json.loads((P/'horizon-80m-metadata.json').read_text());fresh=json.loads((B/'horizon-80m-metadata.json').read_text())
with np.load(A/'source-window.npz',allow_pickle=False) as a:z=a['data']
assert hashlib.sha256(np.ascontiguousarray(z,dtype='<f4').tobytes()).hexdigest()==nm['array_sha256']
nw=nm['window'];fw=fm['window'];nt=Affine(*nm['source_transform'])*Affine.translation(nw[0],nw[1]);ft=Affine(*fresh['source_transform'])*Affine.translation(fw[0],fw[1]);dst=np.full((fw[3],fw[2]),np.nan,dtype='float32')
# Same interpreted map projection on both grids; the true frame identity remains unresolved.
crs=nm['source_crs_wkt'];reproject(source=z,destination=dst,src_transform=nt,src_crs=crs,src_nodata=np.nan,dst_transform=ft,dst_crs=crs,dst_nodata=np.nan,resampling=Resampling.average)
rows=list(csv.DictReader((P/'overlap-area-800-930m.csv').open()));diff=[]
for row in rows:
 c,r=(~ft)*(float(row['x80_m']),float(row['y80_m']));v=float(dst[math.floor(r),math.floor(c)]);assert math.isfinite(v);diff.append(abs(v-float(row['z5_area_mean_m'])))
assert len(diff)==111 and max(diff)<0.001
print(f'GDAL area-average cross-check: {len(diff)} cells; maximum numeric difference {max(diff):.6f} m; not datum validation.')
