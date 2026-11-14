"""Offline contract checks on frozen Site01 ROI evidence; no network access."""
import json, math
from pathlib import Path

p = Path('notebooks/evidence/site01-roi-coverage.json')
assert p.exists(), f'Missing evidence file: {p}'

data = json.loads(p.read_text(encoding='utf-8'))
assert data['site'] == 'Site01'
assert data['roi_sha256'] == '40b961417a344ce0274aecbab522e171a22f658507d82e8fb4d7bc97526ffc4f'
assert data['mask_rule'] == 'pixel center within polygon, all_touched=False'

roi_summary = data['roi_summary']
assert roi_summary['polygon_count'] == 7
assert math.isclose(roi_summary['total_area_m2'], 52825.0, rel_tol=1e-5)
assert roi_summary['roi_cells'] == 2197
assert roi_summary['zero_count_cells'] + roi_summary['positive_count_cells'] == 2197
assert roi_summary['positive_count_cells'] == 227

cand = roi_summary['candidate_point']
assert math.isclose(cand['x_m'], -10797.5, abs_tol=1e-3)
assert math.isclose(cand['y_m'], -11742.5, abs_tol=1e-3)
assert math.isclose(cand['lat_deg'], -89.47393424, abs_tol=1e-5)
assert math.isclose(cand['lon_deg'], -137.40074627, abs_tol=1e-5)
assert cand['margin_to_boundary_m'] >= 30.0
assert cand['count'] >= 1
assert 0.0 < cand['slope_deg'] < 5.0
assert cand['elevation_m'] > 1900.0

layers = data['layers']
assert len(layers) == 5
expected_layers = {'surface', 'count', 'slope', 'z_rms', 'slope_rms'}
assert {l['layer'] for l in layers} == expected_layers

for l in layers:
    assert l['roi_cells'] == 2197
    assert l['valid_roi_cells'] == 2197
    assert l['window'] == [1466, 1496, 302, 233]
    assert l['resolution_m'] == [5.0, 5.0]
    assert math.isfinite(l['min']) and math.isfinite(l['max']) and math.isfinite(l['median'])
    assert l['min'] <= l['median'] <= l['max']
    assert len(l['window_sha256']) == 64

# Check figure exists
fig_path = Path('docs/figures/site01-roi-coverage.png')
assert fig_path.exists(), f'Missing figure: {fig_path}'
assert fig_path.stat().st_size > 10000

print('All Site01 ROI evidence contracts and offline checks passed successfully!')
