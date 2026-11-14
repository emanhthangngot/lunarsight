"""Offline evidence checks; these do not establish a physical accuracy tolerance."""
from pathlib import Path
import csv,json,math,hashlib,statistics
P=Path('notebooks/evidence/site04-case')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rows(name):
 with (P/name).open() as f:return list(csv.DictReader(f))
area=rows('overlap-area-800-930m.csv');am=json.loads((P/'overlap-area-800-930m-metadata.json').read_text())
assert len(area)==am['eligible_80m_cells']==am['complete_pairs']==111 and sha(P/'overlap-area-800-930m.csv')==am['pairs_sha256']
assert all(abs(float(r['valid_area_m2'])-6400)<1e-6 and abs(float(r['z5_area_mean_m'])-float(r['z80_m'])-float(r['difference_m']))<1e-7 for r in area)
assert abs(statistics.median(float(r['difference_m']) for r in area)-am['median_difference_m'])<1e-7
old=rows('horizon-80m.csv');far=rows('horizon-80m-50km.csv');mixed=rows('near-far-50km.csv');mm=json.loads((P/'near-far-50km-metadata.json').read_text())
assert len(old)==len(far)==len(mixed)==360 and sha(P/'near-far-50km.csv')==mm['result_csv_sha256']
assert sha(P/'horizon-80m-50km.csv')==mm['far_csv_sha256'] and sha(P/'near-far-25km.csv')==mm['near_csv_sha256']
for i,(a,b,c) in enumerate(zip(old,far,mixed)):
 assert int(a['grid_azimuth_bin_deg'])==int(b['grid_azimuth_bin_deg'])==int(c['grid_azimuth_bin_deg'])==i
 assert abs(float(a['horizon_deg_25km'])-float(b['horizon_deg_25km']))<1e-9
 assert float(b['horizon_deg_50km'])>=float(b['horizon_deg_25km'])-1e-9
 assert abs(float(c['combined_50km_deg'])-max(float(c['near_5m_deg']),float(c['far_50km_deg'])))<1e-8
 assert float(c['combined_change_deg'])>=-1e-8
assert sum(float(r['peak_distance_m_50km'])>=45000 for r in far)==80
assert sum(float(r['combined_change_deg'])>1e-8 for r in mixed)==134
vec=rows('spherical-crosscheck.csv');vm=json.loads((P/'spherical-crosscheck-metadata.json').read_text())
assert len(vec)==360 and sha(P/'spherical-crosscheck.csv')==vm['output_csv_sha256']
errors=[]
for r in vec:
 d=float(r['planar_approx_max_same_bins_deg'])-float(r['spherical_vector_max_deg']);assert abs(d-float(r['planar_minus_spherical_deg']))<1e-10;errors.append(abs(d))
assert abs(max(errors)-vm['max_abs_deg'])<1e-10
print('Area pairs, nested and combined profiles, and spherical cross-check evidence consistent; independent external reference remains open.')
