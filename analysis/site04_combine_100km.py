"""Combine frozen near and 100 km far profiles; conditional wedge maximum only."""
from pathlib import Path
import csv,json,math,hashlib
P=Path('notebooks/evidence/site04-case');O=Path('artifacts/site04-100km');O.mkdir(parents=True,exist_ok=True)
def read(name):
 with (P/name).open() as stream:return list(csv.DictReader(stream))
near=read('near-far-25km.csv');previous=read('near-far-50km.csv');far=read('horizon-80m-100km.csv')
nm=json.loads((P/'near-far-25km-metadata.json').read_text());fm=json.loads((P/'horizon-80m-100km-metadata.json').read_text())
assert len(near)==len(previous)==len(far)==360 and nm['observer_xy_m']==fm['observer_xy_m'] and nm['observer_ground_m']==fm['observer_ground_m'] and nm['height_agl_m']==fm['observer_height_agl_m']
rows=[]
for i,(n,old,f) in enumerate(zip(near,previous,far)):
 assert all(int(r['grid_azimuth_bin_deg'])==i for r in (n,old,f))
 near_angle=float(n['near_5m_deg']);prior=float(old['combined_50km_deg']);far100=float(f['horizon_deg_100km'])
 nearok=int(n['near_valid_cells'])==int(n['near_total_cells']) and int(n['near_total_cells'])>0
 farok=int(f['valid_cells_100km'])==int(f['total_cells_100km']) and int(f['total_cells_100km'])>0
 if not nearok or not farok or not all(map(math.isfinite,(near_angle,prior,far100))):raise ValueError(f'Incomplete bin {i}')
 new=max(near_angle,far100)
 if new+1e-8<prior:raise AssertionError('Nested combined profile decreased')
 rows.append([i,near_angle,float(f['horizon_deg_50km']),far100,prior,new,new-prior,float(f['peak_distance_m_100km'])])
out=O/'near-far-100km.csv'
with out.open('w',newline='') as stream:
 w=csv.writer(stream,lineterminator='\n');w.writerow(['grid_azimuth_bin_deg','near_5m_deg','far_50km_deg','far_100km_deg','combined_50km_deg','combined_100km_deg','combined_change_deg','far_peak_100km_m']);w.writerows([[r[0],*[format(x,'.9f') for x in r[1:]]] for r in rows])
d=[r[6] for r in rows]
meta={'status':'conditional binned 5m/80m diagnostic; not full horizon or visibility','changed_bins':sum(x>1e-8 for x in d),'max_combined_increase_deg':max(d),'near_csv_sha256':hashlib.sha256((P/'near-far-25km.csv').read_bytes()).hexdigest(),'previous_csv_sha256':hashlib.sha256((P/'near-far-50km.csv').read_bytes()).hexdigest(),'far_csv_sha256':hashlib.sha256((P/'horizon-80m-100km.csv').read_bytes()).hexdigest(),'result_csv_sha256':hashlib.sha256(out.read_bytes()).hexdigest()};(O/'near-far-100km-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta,indent=2))
