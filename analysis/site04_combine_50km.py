"""Combine frozen near and nested 50 km profiles; still a conditional wedge maximum."""
from pathlib import Path
import csv,json,math,hashlib
P=Path('notebooks/evidence/site04-case');O=Path('artifacts/site04-50km');O.mkdir(parents=True,exist_ok=True)
with (P/'near-far-25km.csv').open() as s:near=list(csv.DictReader(s))
with (P/'horizon-80m-50km.csv').open() as s:far=list(csv.DictReader(s))
nm=json.loads((P/'near-far-25km-metadata.json').read_text());fm=json.loads((P/'horizon-80m-50km-metadata.json').read_text())
assert len(near)==len(far)==360 and nm['observer_xy_m']==fm['observer_xy_m'] and nm['observer_ground_m']==fm['observer_ground_m'] and nm['height_agl_m']==fm['observer_height_agl_m']
rows=[]
for i,(n,f) in enumerate(zip(near,far)):
 assert int(n['grid_azimuth_bin_deg'])==int(f['grid_azimuth_bin_deg'])==i
 near_angle=float(n['near_5m_deg']);prior=float(n['combined_deg']);far50=float(f['horizon_deg_50km']);nearok=int(n['near_valid_cells'])==int(n['near_total_cells']) and int(n['near_total_cells'])>0;farok=int(f['valid_cells_50km'])==int(f['total_cells_50km']) and int(f['total_cells_50km'])>0
 if not nearok or not farok or not all(map(math.isfinite,(near_angle,far50,prior))):raise ValueError(f'Incomplete bin {i}')
 new=max(near_angle,far50)
 if new+1e-8<prior:raise AssertionError('Nested combined profile decreased')
 rows.append([i,near_angle,float(f['horizon_deg_25km']),far50,prior,new,new-prior,float(f['peak_distance_m_50km'])])
out=O/'near-far-50km.csv'
with out.open('w',newline='') as stream:
 w=csv.writer(stream,lineterminator='\n');w.writerow(['grid_azimuth_bin_deg','near_5m_deg','far_25km_deg','far_50km_deg','combined_25km_deg','combined_50km_deg','combined_change_deg','far_peak_50km_m']);w.writerows([[r[0],*[format(x,'.9f') for x in r[1:]]] for r in rows])
d=[r[6] for r in rows]
meta={'status':'conditional binned 5m/80m diagnostic, not full horizon or visibility','changed_bins':sum(x>1e-8 for x in d),'max_combined_increase_deg':max(d),'near_csv_sha256':hashlib.sha256((P/'near-far-25km.csv').read_bytes()).hexdigest(),'far_csv_sha256':hashlib.sha256((P/'horizon-80m-50km.csv').read_bytes()).hexdigest(),'result_csv_sha256':hashlib.sha256(out.read_bytes()).hexdigest()};(O/'near-far-50km-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta,indent=2))
