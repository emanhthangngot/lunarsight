"""Bounded exploratory Site04 horizon; far field only, not validated mission output."""
import io,time,json,hashlib,urllib.request,math,csv
from pathlib import Path
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
                    if self.traffic['body_bytes']+(stop-start+1)>48*1024**2:
                        raise IOError('Per-site HTTP body budget exceeded (48 MiB including retries)')
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



URL='https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF'
X0,Y0=-2652.5,-5952.5
GROUND_M=1737.1783447265625
OBS_M=GROUND_M+1.0
R=1737400.0
RADII=(5000,10000,25000,50000,100000)
MIN_DISTANCE_M=1000
OUTPUT=Path('artifacts/site04-100km')
OUTPUT.mkdir(parents=True,exist_ok=True)

# Check the nested-maximum contract on a hand-worked bin sequence.
def max_by_bin(ids,values,n=360):
    result=np.full(n,-np.inf);np.maximum.at(result,ids,values);return result
a=max_by_bin(np.array([0,0,1]),np.array([1.,2.,-1.]),2)
b=max_by_bin(np.array([0,0,1,0,1]),np.array([1.,2.,-1.,1.5,3.]),2)
assert np.array_equal(a,[2.,-1.]) and np.all(b>=a)

req=urllib.request.Request(URL,method='HEAD',headers={'User-Agent':'Mozilla/5.0'})
with urllib.request.urlopen(req,timeout=30) as h: head={k:h.headers.get(k) for k in ('Content-Length','ETag','Last-Modified','Content-Type')}
if 'tiff' not in str(head['Content-Type']).lower(): raise ValueError('Unexpected content type')
blocks={};traffic={'body_bytes':0,'ranges':[]}
def opener(path,mode='rb'):
    if str(path)!=URL: raise FileNotFoundError(path)
    return RangeFile(URL,int(head['Content-Length']),blocks,traffic)
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
 with rasterio.open(URL,opener=opener) as ds:
    if not np.allclose(ds.res,(80,80)):raise ValueError('Expected 80 m grid')
    f=from_bounds(X0-100000,Y0-100000,X0+100000,Y0+100000,ds.transform)
    col,row=math.floor(f.col_off),math.floor(f.row_off); endcol,endrow=math.ceil(f.col_off+f.width),math.ceil(f.row_off+f.height)
    w=Window(col,row,endcol-col,endrow-row)
    if col<0 or row<0 or endcol>ds.width or endrow>ds.height:raise ValueError('Window crosses raster boundary')
    masked=ds.read(1,window=w,masked=True).astype('float32'); a=masked.filled(np.nan)*ds.scales[0]+ds.offsets[0]
    window_hash=hashlib.sha256(np.ascontiguousarray(a,dtype='<f4').tobytes()).hexdigest()
    reference=Path('notebooks/evidence/site04-case/horizon-80m-100km-metadata.json')
    if reference.exists():
      expected=json.loads(reference.read_text())
      if expected['window']!=[col,row,int(w.width),int(w.height)] or expected['window_sha256']!=window_hash:
        raise ValueError('100 km source window changed; review before comparing')
    np.savez_compressed(OUTPUT/'source-window.npz',data=a)  # ignored local cache; never overwrite evidence
    xs=ds.transform.c+(col+np.arange(a.shape[1])+.5)*ds.transform.a
    ys=ds.transform.f+(row+np.arange(a.shape[0])+.5)*ds.transform.e
    xx=xs[None,:]-X0;yy=ys[:,None]-Y0;d=np.hypot(xx,yy)
    az=np.floor(np.degrees(np.arctan2(xx,yy))%360).astype(int)
    angle=np.degrees(np.arctan2(a-OBS_M-d*d/(2*R),d))
    profiles={}; peak_distances={}; valid_counts={}; total_counts={}; metadata={}
    for radius in RADII:
      footprint=(d>=MIN_DISTANCE_M)&(d<=radius); valid=footprint&np.isfinite(a)
      profile=max_by_bin(az[valid],angle[valid]); total=np.bincount(az[footprint],minlength=360);counts=np.bincount(az[valid],minlength=360)
      profile[np.isneginf(profile)]=np.nan
      profiles[radius]=profile
      peak=np.full(360,np.inf); ids=az[valid]; vals=angle[valid]; ds_=d[valid]
      is_peak=vals==profile[ids]
      np.minimum.at(peak,ids[is_peak],ds_[is_peak]);peak[np.isinf(peak)]=np.nan
      peak_distances[radius]=peak;valid_counts[radius]=counts;total_counts[radius]=total
      metadata[str(radius)]={'footprint_cells':int(footprint.sum()),'valid_cells':int(valid.sum()),'empty_bins':int(np.isnan(profile).sum()),'bins_with_missing':int(np.count_nonzero(counts<total))}
    for r1,r2 in zip(RADII,RADII[1:]):
      common=np.isfinite(profiles[r1])&np.isfinite(profiles[r2])
      if not np.all(profiles[r2][common]>=profiles[r1][common]-1e-12):raise AssertionError('Nested horizon maxima decreased')
    # Cross-check the inner profile against previously frozen 25 km evidence.
    with Path('notebooks/evidence/site04-case/horizon-80m.csv').open() as stream:
      old=list(csv.DictReader(stream))
    previous=np.array([float(r['horizon_deg_25km']) for r in old])
    if len(previous)!=360 or not np.allclose(previous,profiles[25000],rtol=0,atol=5.1e-10,equal_nan=True):
      raise ValueError('25 km inner profile does not reproduce frozen evidence')
    with Path('notebooks/evidence/site04-case/horizon-80m-50km.csv').open() as stream:
      old50=list(csv.DictReader(stream))
    previous50=np.array([float(r['horizon_deg_50km']) for r in old50])
    if len(previous50)!=360 or not np.allclose(previous50,profiles[50000],rtol=0,atol=5.1e-10,equal_nan=True):
      raise ValueError('50 km inner profile does not reproduce frozen evidence')
    with (OUTPUT/'horizon-80m.csv').open('w',newline='') as f:
      writer=csv.writer(f,lineterminator='\n');writer.writerow(['grid_azimuth_bin_deg',*[f'{label}_{r//1000}km' for r in RADII for label in ('horizon_deg','peak_distance_m','valid_cells','total_cells')]])
      for i in range(360):
        csv_row=[i]
        for r in RADII:
          csv_row.extend(['' if np.isnan(profiles[r][i]) else format(profiles[r][i],'.9f'),'' if np.isnan(peak_distances[r][i]) else format(peak_distances[r][i],'.3f'),int(valid_counts[r][i]),int(total_counts[r][i])])
        writer.writerow(csv_row)
    meta={'status':'diagnostic; conditional vertical datum; far field 1–100 km only','source_url':URL,'source_headers':head,'http_body_bytes':traffic['body_bytes'],'range_requests':traffic['ranges'],'source_crs_wkt':ds.crs.to_wkt(),'source_shape':[ds.height,ds.width],'source_transform':list(ds.transform)[:6],'source_nodata':str(ds.nodata),'source_scale':ds.scales[0],'source_offset':ds.offsets[0],'window':[col,row,int(w.width),int(w.height)],'window_sha256':window_hash,'observer_xy_m':[X0,Y0],'observer_ground_m':GROUND_M,'observer_height_agl_m':1,'observer_vertical_datum_assumed':'same 1737400 m sphere as Horizons, not confirmed directly for PGDA 78','radii_m':list(RADII),'near_exclusion_m':MIN_DISTANCE_M,'formula':'atan2(z_cell-z_observer-d^2/(2R),d)','azimuth':'floor(degrees(atan2(dx,dy)) mod 360), clockwise from projection grid +Y; no convergence correction','radii_statistics':metadata,'rasterio':rasterio.__version__,'gdal':rasterio.__gdal_version__}
    (OUTPUT/'horizon-80m-metadata.json').write_text(json.dumps(meta,indent=2,allow_nan=False)+'\n')
    print(json.dumps(metadata,indent=2));print('nested maximum checks passed; bytes',traffic['body_bytes'])
