"""Nearest-cell 5m vs 80m overlap at 800–975m, not a datum validation."""
import csv,hashlib,json,math
from pathlib import Path
import numpy as np
P=Path('notebooks/evidence/site04-case'); near=json.loads((P/'near-far-25km-metadata.json').read_text()); far=json.loads((P/'horizon-80m-metadata.json').read_text())
A=Path('artifacts/site04-nearfield');B=Path('artifacts/site04-case')
with np.load(A/'source-window.npz',allow_pickle=False) as z:n=z['data']
with np.load(B/'source-window.npz',allow_pickle=False) as z:f=z['data']
def sha(a):return hashlib.sha256(np.ascontiguousarray(a,dtype='<f4').tobytes()).hexdigest()
if sha(n)!=near['array_sha256'] or sha(f)!=far['window_sha256']:raise ValueError('Input window differs from retained evidence')
t=near['source_transform'];w=near['window']; ft=json.loads((B/'horizon-80m-metadata.json').read_text())['source_transform'];fw=far['window']
if t[1]!=0 or t[3]!=0 or ft[1]!=0 or ft[3]!=0:raise ValueError('Expected north-up grids')
X0,Y0=near['observer_xy_m']; rows=[];eligible=0
for i in range(f.shape[0]):
 for j in range(f.shape[1]):
  x=ft[2]+(fw[0]+j+.5)*ft[0];y=ft[5]+(fw[1]+i+.5)*ft[4];d=math.hypot(x-X0,y-Y0)
  if not 800<=d<975:continue
  eligible+=1;nj=math.floor((x-t[2])/t[0])-w[0];ni=math.floor((y-t[5])/t[4])-w[1]
  if not (0<=ni<n.shape[0] and 0<=nj<n.shape[1]):continue
  z5=float(n[ni,nj]);z80=float(f[i,j])
  if not math.isfinite(z5) or not math.isfinite(z80):continue
  xn=t[2]+(w[0]+nj+.5)*t[0];yn=t[5]+(w[1]+ni+.5)*t[4]
  rows.append((x,y,d,z5,z80,z5-z80,math.hypot(x-xn,y-yn)))
if not rows:raise ValueError('No valid overlap pairs')
D=np.array(rows); out=A/'overlap-800-975m.csv'
with out.open('w',newline='') as stream:
 writer=csv.writer(stream,lineterminator='\n');writer.writerow(['x80_m','y80_m','distance_m','z5_nearest_m','z80_m','z5_minus_z80_m','center_offset_m']);writer.writerows([[format(v,'.9f') for v in row] for row in rows])
meta={'status':'nearest-cell exploratory comparison, not co-registration or datum verification','annulus_m':[800,975],'eligible_80m_cells':eligible,'valid_pairs':len(rows),'median_z5_minus_z80_m':float(np.median(D[:,5])),'mean_z5_minus_z80_m':float(np.mean(D[:,5])),'max_abs_z5_minus_z80_m':float(np.max(np.abs(D[:,5]))),'p95_abs_z5_minus_z80_m':float(np.percentile(np.abs(D[:,5]),95)),'max_center_offset_m':float(D[:,6].max()),'near_window_sha256':sha(n),'far_window_sha256':sha(f),'pair_csv_sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
(A/'overlap-800-975m-metadata.json').write_text(json.dumps(meta,indent=2,allow_nan=False)+'\n');print(json.dumps(meta,indent=2))
