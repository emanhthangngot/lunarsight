"""Offline checks on frozen Site04 near/far evidence; not a science benchmark."""
import csv,hashlib,json,math
from pathlib import Path
p=Path('notebooks/evidence/site04-case')
meta=json.loads((p/'near-far-25km-metadata.json').read_text())
assert hashlib.sha256((p/'horizon-80m.csv').read_bytes()).hexdigest()==meta['far_csv_sha256']
assert hashlib.sha256((p/'horizon-80m-metadata.json').read_bytes()).hexdigest()==meta['far_metadata_sha256']
rows=list(csv.DictReader((p/'near-far-25km.csv').open()))
assert len(rows)==360 and [int(r['grid_azimuth_bin_deg']) for r in rows]==list(range(360))
assert sum(int(r['near_valid_cells']) for r in rows)==meta['near_valid_cells']
assert sum(int(r['near_total_cells']) for r in rows)==meta['near_cells']
near_bigger=far_bigger=0
for r in rows:
 n,f,c=map(float,(r['near_5m_deg'],r['far_80m_deg'],r['combined_deg']))
 assert all(map(math.isfinite,(n,f,c))) and abs(c-max(n,f))<1e-8
 assert int(r['near_valid_cells'])==int(r['near_total_cells']) and r['far_complete']=='True'
 near_bigger+=n>f;far_bigger+=f>n
assert near_bigger==186 and far_bigger==174
print('360 bins: max, completeness, totals and far evidence hashes checked.')
