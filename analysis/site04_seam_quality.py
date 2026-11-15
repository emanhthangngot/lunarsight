"""Site04 seam quality layers: bounded range reads; not a pipeline or datum validation."""
import io,time,json,hashlib,urllib.request,math,csv,os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import rasterio
from rasterio.windows import Window,from_bounds
class RangeFile(io.RawIOBase):
    """Seekable read-only source: validate 206 bodies; reject whole-file fallback."""
    def __init__(self,url,size,blocks,traffic):
        super().__init__(); self.url=url; self.size=size; self.blocks=blocks; self.traffic=traffic; self.pos=0
        self.block_size=512*1024
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self,offset,whence=0):
        self.pos=int(offset if whence==0 else self.pos+offset if whence==1 else self.size+offset)
        if self.pos<0: raise ValueError('Negative offset')
        return self.pos
    def read(self,n=-1):
        if n<0: raise ValueError('Unbounded source read disabled')
        end=min(self.size,self.pos+n); chunks=[]
        while self.pos<end:
            idx=self.pos//self.block_size; start=idx*self.block_size; stop=min(start+self.block_size,self.size)-1
            if idx not in self.blocks:
                last=None
                for attempt in range(3):
                    if self.traffic['body_bytes']+(stop-start+1)>24*1024**2:
                        raise IOError('Per-site HTTP body budget exceeded (24 MiB including retries)')
                    try:
                        req=urllib.request.Request(self.url,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={start}-{stop}'})
                        with urllib.request.urlopen(req,timeout=25) as r:
                            if r.status!=206 or r.headers.get('Content-Range')!=f'bytes {start}-{stop}/{self.size}':
                                raise IOError('Source ignored/misreported requested byte range')
                            body=r.read(stop-start+2)
                            self.traffic['body_bytes']+=len(body)
                            if len(body)!=stop-start+1: raise IOError('Truncated or oversized byte range')
                            self.blocks[idx]=body; self.traffic['ranges'].append([start,stop]); break
                    except Exception as exc:
                        last=exc
                        if attempt==2: raise IOError(f'Failed range {start}-{stop}: {exc}') from exc
                        time.sleep(1)
            data=self.blocks[idx]; take=min(end-self.pos,stop-self.pos+1)
            chunks.append(data[self.pos-start:self.pos-start+take]); self.pos+=take
        return b''.join(chunks)
    def readinto(self,b):
        d=self.read(len(b)); b[:len(d)]=d; return len(d)





P=Path('notebooks/evidence/site04-case');O=Path('artifacts/site04-seam-quality');O.mkdir(parents=True,exist_ok=True)
FETCH=os.environ.get('SITE04_FETCH_QUALITY','0')=='1'
near=json.loads((P/'near-far-25km-metadata.json').read_text());far=json.loads((P/'horizon-80m-metadata.json').read_text());fresh=json.loads(Path('artifacts/site04-case/horizon-80m-metadata.json').read_text())
if fresh['window_sha256']!=far['window_sha256']:raise ValueError('far baseline hash mismatch')
near_w=near['window'];near_t=near['source_transform'];far_t=fresh['source_transform'];fw=far['window'];x0,y0=near['observer_xy_m']
SOURCES={'5m_count':('https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_ldec.tif','near'), '5m_zrms':('https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_toterr.tif','near'), '80m_count':('https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEC_80S_80MPP_ADJ.TIF','far'), '80m_effres':('https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_EFFRES.TIF','far'), '80m_zerr':('https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_ERR.TIF','far')}
def read_layer(item):
 name,(url,kind)=item;file=O/(name+'.npz')
 if file.exists():
  with np.load(file,allow_pickle=False) as z:a=z['data'];meta=json.loads(str(z['metadata']))
 else:
  if not FETCH:raise FileNotFoundError(f'{file}; set SITE04_FETCH_QUALITY=1')
  req=urllib.request.Request(url,method='HEAD',headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=30) as h:headers={k:h.headers.get(k) for k in ('Content-Length','ETag','Last-Modified','Content-Type')}
  if 'tiff' not in str(headers['Content-Type']).lower():raise ValueError('Unexpected content type')
  blocks={};traffic={'body_bytes':0,'ranges':[]}
  def opener(path,mode='rb'):
   if str(path)!=url:raise FileNotFoundError(path)
   return RangeFile(url,int(headers['Content-Length']),blocks,traffic)
  with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
   with rasterio.open(url,opener=opener) as ds:
    expected=rasterio.Affine(*(near_t if kind=='near' else far_t))
    if not ds.transform.almost_equals(expected):raise ValueError(f'{name}: grid transform differs from baseline DEM')
    base_crs=rasterio.crs.CRS.from_wkt(near['source_crs_wkt'] if kind=='near' else far['source_crs_wkt'])
    if ds.crs.to_proj4()!=base_crs.to_proj4():raise ValueError(f'{name}: projection parameters differ')
    if kind=='near':w=Window(*near_w)
    else:
     q=from_bounds(x0-1020,y0-1020,x0+1020,y0+1020,ds.transform)
     col,row=math.floor(q.col_off),math.floor(q.row_off);ec,er=math.ceil(q.col_off+q.width),math.ceil(q.row_off+q.height);w=Window(col,row,ec-col,er-row)
    a=ds.read(1,window=w,masked=True).astype('float32').filled(np.nan)*ds.scales[0]+ds.offsets[0]
    meta={'layer':name,'url':url,'headers':headers,'source_crs_wkt':ds.crs.to_wkt(),'source_transform':list(ds.transform)[:6],'window':[w.col_off,w.row_off,w.width,w.height],'scale':ds.scales[0],'offset':ds.offsets[0],'nodata':str(ds.nodata),'ranges':traffic['ranges'],'http_body_bytes':traffic['body_bytes'],'window_sha256':hashlib.sha256(np.ascontiguousarray(a,dtype='<f4').tobytes()).hexdigest()}
  np.savez_compressed(file,data=a,metadata=json.dumps(meta))
 if hashlib.sha256(np.ascontiguousarray(a,dtype='<f4').tobytes()).hexdigest()!=meta['window_sha256']:raise ValueError(f'{name}: cache hash mismatch')
 frozen=P/'seam-quality-metadata.json'
 if frozen.exists():
  expected=next(z for z in json.loads(frozen.read_text())['sources'] if z['layer']==name)
  if meta['window_sha256']!=expected['window_sha256'] or meta['window']!=expected['window']:raise ValueError(f'{name}: source differs from frozen evidence; review required')
 print(name,'loaded',a.shape,'valid',int(np.isfinite(a).sum()),flush=True)
 return name,a,meta
with ThreadPoolExecutor(max_workers=5) as ex: results=list(ex.map(read_layer,SOURCES.items()))
arrays={n:a for n,a,m in results};metas={n:m for n,a,m in results}
with (P/'overlap-area-800-930m.csv').open() as s:points=list(csv.DictReader(s))
assert len(points)==111
nl=near_t[2]+near_w[0]*5;ntop=near_t[5]-near_w[1]*5
rows=[]
for pt in points:
 x,y=float(pt['x80_m']),float(pt['y80_m']);left,right=x-40,x+40;bottom,top=y-40,y+40
 c0=math.floor((left-nl)/5);c1=math.ceil((right-nl)/5);r0=math.floor((ntop-top)/5);r1=math.ceil((ntop-bottom)/5)
 total=0.;validarea=0.;positivearea=0.;rmsarea=0.;botharea=0.
 for rr in range(r0,r1):
  pyhi=ntop-rr*5;pylo=pyhi-5;hy=max(0,min(top,pyhi)-max(bottom,pylo))
  for cc in range(c0,c1):
   pxlo=nl+cc*5;pxhi=pxlo+5;area=hy*max(0,min(right,pxhi)-max(left,pxlo))
   if area<=0:continue
   total+=area;count=arrays['5m_count'][rr,cc];err=arrays['5m_zrms'][rr,cc]
   if np.isfinite(count):validarea+=area;positivearea+=area*(count>0)
   if np.isfinite(err):rmsarea+=float(err)*area;botharea+=area
 assert math.isclose(total,6400,abs_tol=1e-5)
 vals={}
 for name in ('80m_count','80m_effres','80m_zerr'):
  m=metas[name];t=m['source_transform'];w=m['window'];c=math.floor((x-t[2])/t[0])-int(w[0]);r=math.floor((y-t[5])/t[4])-int(w[1]);v=float(arrays[name][r,c]);vals[name]=v if math.isfinite(v) else None
 rows.append({'x80_m':x,'y80_m':y,'z5_minus_z80_area_mean_m':float(pt['difference_m']),'area_5m_count_valid_m2':validarea,'area_5m_positive_fraction':positivearea/6400 if math.isclose(validarea,6400,abs_tol=1e-6) else None,'area_5m_zrms_valid_m2':botharea,'area_mean_5m_zrms_m':rmsarea/6400 if math.isclose(botharea,6400,abs_tol=1e-6) else None,**vals})
for r in rows:
 for key in ('area_5m_positive_fraction','area_mean_5m_zrms_m','80m_count','80m_effres','80m_zerr'):
  if r[key] is not None and r[key]<0:raise ValueError(f'Negative value in {key}')
fields=list(rows[0]);out=O/'seam-quality.csv'
with out.open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows(rows)
summary={'status':'bounded diagnostic; same footprint, not equal effective resolution; no uncertainty propagation','pixels':len(rows),'sources':list(metas.values()),'output_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'zero_80m_count_cells':sum(r['80m_count']==0 for r in rows),'null_by_field':{k:sum(r[k] is None for r in rows) for k in fields},'all_5m_count_full_area':sum(r['area_5m_count_valid_m2']==6400 for r in rows),'all_5m_zrms_full_area':sum(r['area_5m_zrms_valid_m2']==6400 for r in rows)}
for k in ['area_5m_positive_fraction','area_mean_5m_zrms_m','80m_count','80m_effres','80m_zerr']:
 vals=[r[k] for r in rows if r[k] is not None];summary[k]={'min':min(vals),'median':float(np.median(vals)),'max':max(vals)} if vals else None
frozen=P/'seam-quality-metadata.json'
if frozen.exists() and summary['output_sha256']!=json.loads(frozen.read_text())['output_sha256']:
 raise ValueError('Quality results changed from frozen evidence; review before replacing')
(O/'seam-quality-metadata.json').write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n');print(json.dumps({k:v for k,v in summary.items() if k!='sources'},indent=2))
