"""Independent contract checks for frozen diagnostic outputs; no network access."""
import csv,datetime,json,math
from pathlib import Path
P=Path('notebooks/evidence/site04-case')
m=json.loads((P/'horizon-80m-metadata.json').read_text())
rows=list(csv.DictReader((P/'horizon-80m.csv').open()))
assert len(rows)==360 and [int(r['grid_azimuth_bin_deg']) for r in rows]==list(range(360))
for row in rows:
    angles=[float(row[f'horizon_deg_{r}km']) for r in (5,10,25)]
    assert all(math.isfinite(x) for x in angles)
    assert angles[0]<=angles[1]+1e-9 and angles[1]<=angles[2]+1e-9
    for r in (5,10,25):
        peak=float(row[f'peak_distance_m_{r}km'])
        assert 1000<=peak<=r*1000 and 0<int(row[f'valid_cells_{r}km'])<=int(row[f'total_cells_{r}km'])
for r in (5,10,25):
    assert sum(int(row[f'valid_cells_{r}km']) for row in rows)==m['radii_statistics'][str(r*1000)]['valid_cells']
assert m['window']==[3454,3561,626,626]
for name in ('sun','earth'):
    text=json.loads((P/(name+'.json')).read_text())['result']
    assert 'Center pole/equ : MEAN_ME (high precision)' in text
    assert 'Center radii    : 1737.4, 1737.4, 1737.4 km' in text
    times=[datetime.datetime.strptime(r.split(',')[0].strip(),'%Y-%b-%d %H:%M') for r in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()]
    assert len(times)==745 and times[0]==datetime.datetime(2027,1,1) and times[-1]==datetime.datetime(2027,2,1)
    assert all((b-a).total_seconds()==3600 for a,b in zip(times,times[1:]))
# Compare the approximation to exact spherical geometry for flat, zero-height terrain.
R=1737400.0
for d in (1000,5000,10000,25000):
    approximate=math.degrees(math.atan2(-1-d*d/(2*R),d))
    exact=math.degrees(math.atan2(R*math.cos(d/R)-(R+1),R*math.sin(d/R)))
    assert abs(approximate-exact)<0.00001
print('Frozen output contracts and ideal-sphere approximation passed; no independent terrain benchmark.')
