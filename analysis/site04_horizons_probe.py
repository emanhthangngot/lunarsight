import urllib.request,urllib.parse,json,hashlib,datetime
from pathlib import Path
base='https://ssd.jpl.nasa.gov/api/horizons.api'
for target,name in [('10','sun'),('399','earth')]:
 params={'format':'json','COMMAND':f"'{target}'",'EPHEM_TYPE':"'OBSERVER'",'CENTER':"'coord@301'",'COORD_TYPE':"'GEODETIC'",'SITE_COORD':"'-155.98171723291347,-89.78509165766015,1.7381783447265625'",'START_TIME':"'2027-01-01 00:00'",'STOP_TIME':"'2027-02-01 00:00'",'STEP_SIZE':"'1h'",'QUANTITIES':"'4'",'ANG_FORMAT':"'DEG'",'CSV_FORMAT':"'YES'"}
 url=base+'?'+urllib.parse.urlencode(params); req=urllib.request.Request(url,headers={'User-Agent':'LunarSight-research/1.0'})
 with urllib.request.urlopen(req,timeout=60) as r: payload=r.read(3_000_001)
 assert len(payload)<3_000_001
 obj=json.loads(payload); txt=obj.get('result','')
 if obj.get('error') or '$$SOE' not in txt or '$$EOE' not in txt:raise ValueError(obj.get('error',txt[-500:]))
 lines=txt.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
 times=[datetime.datetime.strptime(line.split(',')[0].strip(),'%Y-%b-%d %H:%M') for line in lines]
 if len(times)!=745 or times[0]!=datetime.datetime(2027,1,1) or times[-1]!=datetime.datetime(2027,2,1) or any((b-a).total_seconds()!=3600 for a,b in zip(times,times[1:])): raise ValueError('Unexpected time coverage')
 if 'Center pole/equ : MEAN_ME (high precision)' not in txt or 'Center radii    : 1737.4, 1737.4, 1737.4 km' not in txt: raise ValueError('Unexpected lunar observer frame/radii')
 outdir=Path('artifacts/site04-case');outdir.mkdir(parents=True,exist_ok=True)
 out=outdir/(name+'.json');out.write_bytes(payload)
 print(name,'rows',len(lines),'sha256',hashlib.sha256(payload).hexdigest());print('\n'.join(l for l in txt.splitlines() if 'Center pole/equ' in l or 'Center radii' in l))
