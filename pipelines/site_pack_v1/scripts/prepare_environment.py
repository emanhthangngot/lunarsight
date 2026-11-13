#!/usr/bin/env python3
"""Prepare bounded real Diviner and Lunar Prospector extracts; no ice abundance inference.
Run using the pack's requirements environment, with --pack-root and --cache overrides.
Seasonal retrieval caches selected PDS4 tables, retaining bounded byte-offset source extracts.
"""
from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse, csv, hashlib, io, json, math, re, time, shutil
import numpy as np
import pandas as pd
import xml.etree.ElementTree as ET

BASE='https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/'
LP='https://pds-geosciences.wustl.edu/missions/lunarp/reduced/hydrogenlow.txt'
SITES=[('A',-89.24,32.40),('B',-88.82,12.10),('C',-89.62,178.30),('D',-85.91,12.92),('E',-85.22,36.12),('SHIV',-69.37,32.32)]
RADIUS_M=1737400.0

def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()

def get(url,path):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 if path.exists() and path.stat().st_size:return path
 for attempt in range(4):
  try:
   tmp=path.with_suffix(path.suffix+'.part')
   with urlopen(url,timeout=90) as r,tmp.open('wb') as f:shutil.copyfileobj(r,f,1048576)
   tmp.replace(path);return path
  except Exception:
   if attempt==3:raise
   time.sleep(1+attempt)

def dist(lat,lon,lat0,lon0):
 a=np.radians(lat);b=np.radians(lat0);dl=np.radians((np.asarray(lon)-lon0+180)%360-180)
 return 2*RADIUS_M*np.arcsin(np.sqrt(np.clip(np.sin((a-b)/2)**2+np.cos(a)*np.cos(b)*np.sin(dl/2)**2,0,1)))

def dump(path,obj):Path(path).write_text(json.dumps(obj,indent=2,allow_nan=False)+'\n')

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--pack-root',type=Path,default=Path(__file__).resolve().parents[1]);ap.add_argument('--cache',type=Path,default=Path(__file__).resolve().parents[2]/'lunarsight_dataset_work/environment_raw');ap.add_argument('--skip-seasonal',action='store_true');ap.add_argument('--reuse-prp',action='store_true');args=ap.parse_args()
 P=args.pack_root;C=args.cache;M=P/'metadata/environment';T=P/'data/environment/thermal';R=P/'data/environment/resources'
 for p in [C,M,T,R]:p.mkdir(parents=True,exist_ok=True)
 sources=[]
 def source(url,path,**kw):sources.append(dict(url=url,local_path=str(Path(path).relative_to(P)) if Path(path).is_relative_to(P) else 'original cached outside deliverable: '+Path(path).name,sha256=sha(path),bytes=Path(path).stat().st_size,**kw))
 for suffix in ['lbl','xml']:
  u=BASE+'data_derived_prp/dlre_prp_south.'+suffix;p=get(u,M/('dlre_prp_south.'+suffix));source(u,p,role='original PDS product label')
 u=BASE+'data_derived_prp/dlre_prp_south.tab';p=get(u,C/'dlre_prp_south.tab');source(u,p,role='original complete PRP V2 source table',product_id='LRO-L-DLRE-5-PRP-V2.0',units={'temp_avg':'K at 2 cm depth','temp_max':'K at surface','ice_depth':'m, stability model, not abundance'},coverage='south polar triangular terrain mesh; actual facet centres approximately 75.9S–90S',resolution='triangular mesh facets approximately 500 m spacing; vertices preserved; no artificial resampling')
 if not args.reuse_prp:
  subsets={s:[] for s,_,_ in SITES};nearest={s:(float('inf'),None) for s,_,_ in SITES}
  for chunk in pd.read_csv(p,skipinitialspace=True,chunksize=150000):
   chunk['source_table_record_1based']=chunk.index+1
   for sid,lat,lon in SITES:
    d=dist(chunk.tri_clat.values,chunk.tri_clon.values,lat,lon);j=int(d.argmin())
    if d[j]<nearest[sid][0]:nearest[sid]=(float(d[j]),chunk.iloc[j].to_dict())
    keep=chunk.loc[d<=3000].copy();keep['distance_to_site_m']=d[d<=3000]
    if len(keep):subsets[sid].append(keep)
  summary=[]
  for sid,lat,lon in SITES:
   dd,row=nearest[sid];covered=dd<=1000
   if subsets[sid]:
    z=pd.concat(subsets[sid],ignore_index=True);z.insert(0,'site_id',sid);z.to_csv(T/f'{sid}_diviner_prp_facets_3km.csv',index=False,float_format='%.9f')
   summary.append(dict(site_id=sid,lat_deg=lat,lon_deg_east=lon,thermal_annual_mean_at_2cm_K=float(row['temp_avg']) if covered else None,thermal_annual_surface_max_K=float(row['temp_max']) if covered else None,thermal_annual_surface_min_K=None,annual_surface_min_null_reason='PRP V2 has no annual minimum field; seasonal snapshots are not annual extrema.',thermal_status='nearest PRP triangular facet centre' if covered else 'outside downloaded PRP south-polar mesh coverage',source_facet_lat_deg=float(row['tri_clat']) if covered else None,source_facet_lon_deg_east=float(row['tri_clon'])%360 if covered else None,source_distance_m=dd if covered else None,source_table_record_1based=int(row['source_table_record_1based']) if covered else None,ice_stability_depth_model_m=float(row['ice_depth']) if covered and row['ice_depth']!=-999 else None,ice_stability_depth_null_reason=None if covered and row['ice_depth']!=-999 else ('outside PRP coverage' if not covered else 'PDS exclude value -999: calculated stability depth exceeds 2.8738 m'),water_ice_wt_pct=None,water_ice_wt_pct_null_reason='No local measured water-ice abundance supplied. Hydrogen ppm and modeled ice stability cannot establish local water-ice wt%.'))
  pd.DataFrame(summary).to_csv(T/'site_thermal_summary.csv',index=False)
  dump(T/'site_thermal_summary.json',summary)
 print('PRP extracts ready',flush=True)
 # Preserve complete compact hydrogen original and bin geometry; use containment, not interpolation.
 p=get(LP,C/'hydrogenlow.txt');shutil.copy2(p,R/'hydrogenlow_original.txt');source(LP,R/'hydrogenlow_original.txt',role='complete original LP special product',units='H ppm by weight',coverage='global',resolution='11306 equal-area bins; nominal 60 km by 60 km',quality='NASA PDS-hosted special product; not a PDS peer-reviewed archive; no per-bin uncertainty supplied')
 lp=np.loadtxt(p,comments='#',delimiter=',');lpframe=pd.DataFrame(lp,columns=['lat_min_deg','lat_max_deg','lon_min_deg_east','lon_max_deg_east','hydrogen_ppm_by_weight']);lpframe.to_csv(R/'lunar_prospector_hydrogen_bins.csv',index=False)
 out=[]
 for sid,lat,lon in SITES:
  signed=(lon+180)%360-180;idx=np.flatnonzero((lp[:,0]<=lat)&(lat<lp[:,1])&(lp[:,2]<=signed)&(signed<lp[:,3]));assert len(idx)==1,(sid,idx)
  k=int(idx[0]);rr=dict(site_id=sid,lat_deg=lat,lon_deg_east=lon,source_bin_index_0based=k,hydrogen_ppm_by_weight=float(lp[k,4]),hydrogen_uncertainty_ppm=None,hydrogen_uncertainty_null_reason='No standard deviation supplied for hydrogenlow product',source_lat_min_deg=float(lp[k,0]),source_lat_max_deg=float(lp[k,1]),source_lon_min_deg_east=float(lp[k,2]),source_lon_max_deg_east=float(lp[k,3]),water_ice_wt_pct=None,water_ice_wt_pct_null_reason='Hydrogen abundance does not uniquely identify water ice; no measured local ice abundance is available.',quality='coarse regional neutron-derived proxy; PDS-hosted non-peer-reviewed special product');out.append(rr);dump(R/f'{sid}_resource_evidence.json',rr)
 pd.DataFrame(out).to_csv(R/'site_resource_evidence.csv',index=False);dump(R/'site_resource_evidence.json',out)
 # Capture primary explanatory pages in provenance, rather than embedding untraceable assumptions.
 for url,name in [('https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html','lunar_prospector_special_products.html'),('https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds','diviner_seasonal_release.html'),(BASE+'data_derived_prp/collection_data_derived_prp.xml','collection_data_derived_prp.xml')]:
  try:pp=get(url,M/name);source(url,pp,role='primary documentation')
  except Exception as e:print('documentation failed',url,str(e),flush=True)
 if not args.skip_seasonal:
  ns={'p':'http://pds.nasa.gov/pds4/pds/v1'}
  def seasonal(ls,slon):
   name=f'pcp_avg_tbol_pols_ls{ls:03d}_slon{slon:02d}_240';url=BASE+'data_derived_pcp/seasonal/slon/pols/'+name+'.tab';xml=get(url[:-3]+'xml',M/(name+'.xml'));rt=ET.parse(xml).getroot();records=int(rt.find('.//p:Table_Character/p:records',ns).text);rb=68
   full=get(url,C/(name+'.tab'));log=[];best={sid:(float('inf'),None,None) for sid,_,_ in SITES if sid!='SHIV'}
   for chunk in pd.read_csv(full,skipinitialspace=True,chunksize=200000):
    for sid,lat,lon in SITES[:5]:
     ds=dist(chunk.clat.values,chunk.clon.values,lat,lon);j=int(ds.argmin());dd=float(ds[j])
     if dd<best[sid][0]:best[sid]=(dd,chunk.iloc[j].to_dict(),int(chunk.index[j]))
   result=[]
   for sid,lat,lon in SITES:
    if lat>-80:
     result.append(dict(site_id=sid,ls_center_deg=ls,subsolar_longitude_bin=slon,ls_min_deg=ls-30,ls_max_deg=ls+30,subsolar_lon_min_deg=(slon-1)*15,subsolar_lon_max_deg=slon*15,source_product=name,tbol_K=None,status='outside 80–90S coverage'));continue
    dd,v,idx=best[sid];valid=dd<=600 and 0<float(v['tbol'])<450
    start=68+idx*rb;end=start+rb-1;fp=C/(name+f'_range_{start}_{end}.bin')
    with full.open('rb') as fh:fh.seek(start);data=fh.read(rb)
    fp.write_bytes(data)
    log.append(dict(url=url,site_id=sid,byte_start=start,byte_end_inclusive=end,record_index_0based=idx,sha256=sha(fp),bytes=len(data),cache_file=fp.name))
    result.append(dict(site_id=sid,ls_center_deg=ls,ls_min_deg=ls-30,ls_max_deg=ls+30,subsolar_longitude_bin=slon,subsolar_lon_min_deg=(slon-1)*15,subsolar_lon_max_deg=slon*15,source_lat_deg=float(v['clat']),source_lon_deg_east=float(v['clon'])%360,source_distance_m=dd,source_record_0based=idx,lunar_local_time_hours=float(v['ltim']),tbol_K=float(v['tbol']) if valid else None,status='global nearest available observed bin within 600m' if valid else 'global nearest available observed bin exceeds 600m; no local value assigned',source_product=name))
   # Store the retrieved source row blocks in pack too, making subset provenance auditable offline.
   rangeout=M/'seasonal_source_ranges';rangeout.mkdir(exist_ok=True)
   for item in log:shutil.copy2(C/item['cache_file'],rangeout/item['cache_file'])
   dump(M/(name+'_ranges.json'),log)
   return name,result,dict(url=url,product_label=str(xml.relative_to(P)),product_label_sha256=sha(xml),source_sha256=sha(full),source_bytes=full.stat().st_size,role='byte-offset extracts from complete selected source table cached externally; only extracted source records are included',units='K, average bolometric brightness temperature',coverage='80S–90S, 240m grid',source_time_range='2009-07-05T16:50:26.195Z / 2020-03-15T00:00:00Z',range_manifest=str((M/(name+'_ranges.json')).relative_to(P)))
  allrows=[];fail=[]
  with ThreadPoolExecutor(max_workers=6) as pool:
   fs={pool.submit(seasonal,ls,slon):(ls,slon) for ls in [30,90,150,210,270,330] for slon in [1,13]}
   for f in as_completed(fs):
    try:name,rows,src=f.result();allrows+=rows;sources.append(src);print('seasonal ready',name,flush=True)
    except Exception as e:fail.append(dict(bin=fs[f],error=str(e)));print('seasonal failed',fs[f],str(e),flush=True)
  if allrows:
   df=pd.DataFrame(allrows).sort_values(['site_id','ls_center_deg','subsolar_longitude_bin']);df.to_csv(T/'site_seasonal_temperature_samples.csv',index=False)
   for sid,_,_ in SITES:df[df.site_id==sid].to_csv(T/f'{sid}_seasonal_temperature_samples.csv',index=False)
  dump(M/'seasonal_retrieval_failures.json',fail)
 dump(M/'environment_manifest_fragment.json',dict(created_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),sites=[dict(site_id=s,lat_deg=a,lon_deg_east=b) for s,a,b in SITES],sources=sources,outputs=[dict(path=str(f.relative_to(P)),bytes=f.stat().st_size,sha256=sha(f)) for folder in [T,R] for f in sorted(folder.glob('*')) if f.is_file()],critical_limitations=['PRP annual mean is at 2 cm depth; annual maximum is at surface; no annual minimum provided','PCP snapshots cover selected seasonal and subsolar-longitude bins, not an annual envelope or scenario forecast','SHIV is outside selected polar thermal products','water_ice_wt_pct remains null for every site; no abundance inferred from hydrogen or modeled stability']))
 print('environment pack prepared',flush=True)
if __name__=='__main__':main()
