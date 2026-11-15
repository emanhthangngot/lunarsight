"""Offline consistency checks for the 100 km case; not a terrain benchmark."""
import csv,hashlib,json,math
from pathlib import Path
P=Path('notebooks/evidence/site04-case')
def read(name):
 with (P/name).open() as f:return list(csv.DictReader(f))
def digest(name):return hashlib.sha256((P/name).read_bytes()).hexdigest()
far=read('horizon-80m-100km.csv');mixed=read('near-far-100km.csv');old=read('horizon-80m-50km.csv');meta=json.loads((P/'horizon-80m-100km-metadata.json').read_text());cm=json.loads((P/'near-far-100km-metadata.json').read_text())
assert len(far)==len(mixed)==len(old)==360
assert meta['radii_statistics']['100000']=={'footprint_cells':4908236,'valid_cells':4908236,'empty_bins':0,'bins_with_missing':0}
assert digest('horizon-80m-100km.csv')==cm['far_csv_sha256'] and digest('near-far-100km.csv')==cm['result_csv_sha256']
assert digest('near-far-25km.csv')==cm['near_csv_sha256'] and digest('near-far-50km.csv')==cm['previous_csv_sha256']
for i,(f,m,o) in enumerate(zip(far,mixed,old)):
 assert all(int(z['grid_azimuth_bin_deg'])==i for z in (f,m,o))
 assert abs(float(f['horizon_deg_50km'])-float(o['horizon_deg_50km']))<1e-9
 assert float(f['horizon_deg_100km'])>=float(f['horizon_deg_50km'])-1e-9
 assert math.isclose(float(m['combined_100km_deg']),max(float(m['near_5m_deg']),float(m['far_100km_deg'])),abs_tol=1e-8)
 assert float(m['combined_change_deg'])>=-1e-8
assert sum(float(r['peak_distance_m_100km'])>=90000 for r in far)==70
assert sum(float(r['combined_change_deg'])>1e-8 for r in mixed)==106
print('100 km evidence: nested bins, source hashes, complete counts and combined profile consistent; no external terrain benchmark.')
