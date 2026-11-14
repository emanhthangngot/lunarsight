"""Compare area-weighted 5 m means to 80 m cells, not effective-resolution equivalence."""
from pathlib import Path
import csv,json,hashlib,math
import numpy as np
P=Path('notebooks/evidence/site04-case'); A=Path('artifacts/site04-nearfield');B=Path('artifacts/site04-case')
nmeta=json.loads((P/'near-far-25km-metadata.json').read_text());fmeta=json.loads((P/'horizon-80m-metadata.json').read_text());fresh=json.loads((B/'horizon-80m-metadata.json').read_text())
with np.load(A/'source-window.npz',allow_pickle=False) as z:n=z['data']
with np.load(B/'source-window.npz',allow_pickle=False) as z:f=z['data']
def sha(a):return hashlib.sha256(np.ascontiguousarray(a,dtype='<f4').tobytes()).hexdigest()
assert sha(n)==nmeta['array_sha256'] and sha(f)==fmeta['window_sha256']
assert fresh['window']==fmeta['window'] and fresh['window_sha256']==fmeta['window_sha256']
nt=nmeta['source_transform']; nw=nmeta['window'];ft=fresh['source_transform'];fw=fmeta['window'];x0,y0=nmeta['observer_xy_m']
assert nt[0]==5 and nt[4]==-5 and ft[0]==80 and ft[4]==-80 and nt[1]==nt[3]==ft[1]==ft[3]==0
nl=nt[2]+nw[0]*5; ntop=nt[5]-nw[1]*5
rows=[];eligible=0
for i in range(f.shape[0]):
 for j in range(f.shape[1]):
  x=ft[2]+(fw[0]+j+.5)*80; y=ft[5]-(fw[1]+i+.5)*80; d=math.hypot(x-x0,y-y0)
  if not (800<=d<930):continue
  eligible+=1;left,right=x-40,x+40;bottom,top=y-40,y+40
  c0=math.floor((left-nl)/5);c1=math.ceil((right-nl)/5);r0=math.floor((ntop-top)/5);r1=math.ceil((ntop-bottom)/5)
  if c0<0 or r0<0 or c1>n.shape[1] or r1>n.shape[0]:continue
  total=0.;weighted=0.;missing=False
  for rr in range(r0,r1):
   pyhi=ntop-rr*5;pylo=pyhi-5;hy=max(0,min(top,pyhi)-max(bottom,pylo))
   for cc in range(c0,c1):
    pxlo=nl+cc*5;pxhi=pxlo+5;hx=max(0,min(right,pxhi)-max(left,pxlo));area=hx*hy
    if area>0 and not np.isfinite(n[rr,cc]):missing=True
    if area>0 and np.isfinite(n[rr,cc]):weighted+=float(n[rr,cc])*area;total+=area
  if missing or not np.isfinite(f[i,j]) or not math.isclose(total,6400,abs_tol=1e-6):continue
  z5=weighted/total;z80=float(f[i,j]);rows.append([x,y,d,z5,z80,z5-z80,total])
if not rows:raise ValueError('No complete paired 80 m footprints')
out=Path('artifacts/site04-nearfield');out.mkdir(parents=True,exist_ok=True);csvpath=out/'overlap-area-800-930m.csv'
with csvpath.open('w',newline='') as stream:
 writer=csv.writer(stream,lineterminator='\n');writer.writerow(['x80_m','y80_m','distance_m','z5_area_mean_m','z80_m','difference_m','valid_area_m2']);writer.writerows([[format(v,'.9f') for v in row] for row in rows])
d=np.array(rows)[:,5];m={'annulus_m':[800,930],'sampling':'area-weighted 5m cells within 80m footprint on projected grids; no kernel or effective-resolution matching','eligible_80m_cells':eligible,'complete_pairs':len(rows),'median_difference_m':float(np.median(d)),'mean_difference_m':float(np.mean(d)),'p95_abs_difference_m':float(np.percentile(np.abs(d),95)),'max_abs_difference_m':float(np.max(np.abs(d))),'near_window_sha256':sha(n),'far_window_sha256':sha(f),'pairs_sha256':hashlib.sha256(csvpath.read_bytes()).hexdigest()};(out/'overlap-area-800-930m-metadata.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps(m,indent=2))
