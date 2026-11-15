"""Conditional near/far horizon diagnostic for Site04; not mission visibility."""
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




URL='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif'
X0,Y0=-2652.5,-5952.5
GROUND_M=1737.1783447265625
OBS_M=GROUND_M+1.0
R=1737400.0
MIN_DISTANCE_M=5.0
MAX_DISTANCE_M=1000.0
OUTPUT=Path('artifacts/site04-nearfield');OUTPUT.mkdir(parents=True,exist_ok=True)
REFERENCE=Path('notebooks/evidence/site04-case')
req=urllib.request.Request(URL,method='HEAD',headers={'User-Agent':'Mozilla/5.0'})
with urllib.request.urlopen(req,timeout=30) as h: head={k:h.headers.get(k) for k in ('Content-Length','ETag','Last-Modified','Content-Type')}
if 'tiff' not in str(head['Content-Type']).lower():raise ValueError('Unexpected content type')
blocks={};traffic={'body_bytes':0,'ranges':[]}
def opener(path,mode='rb'):
    if str(path)!=URL:raise FileNotFoundError(path)
    return RangeFile(URL,int(head['Content-Length']),blocks,traffic)
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
 with rasterio.open(URL,opener=opener) as ds:
    if not np.allclose(ds.res,(5,5)):raise ValueError('Expected 5 m grid')
    far_meta=json.loads((REFERENCE/'horizon-80m-metadata.json').read_text())
    if (far_meta['observer_xy_m']!=[X0,Y0] or far_meta['observer_ground_m']!=GROUND_M or far_meta['observer_height_agl_m']!=1 or far_meta['near_exclusion_m']!=MAX_DISTANCE_M):raise ValueError('Near/far observer or seam differs')
    far_crs=rasterio.crs.CRS.from_wkt(far_meta['source_crs_wkt'])
    semantic_equal=bool(ds.crs==far_crs)
    if ds.crs.to_proj4()!=far_crs.to_proj4():raise ValueError('Near/far map projection parameters differ')
    f=from_bounds(X0-1000,Y0-1000,X0+1000,Y0+1000,ds.transform)
    col,row=math.floor(f.col_off),math.floor(f.row_off); endcol,endrow=math.ceil(f.col_off+f.width),math.ceil(f.row_off+f.height)
    w=Window(col,row,endcol-col,endrow-row)
    if col<0 or row<0 or endcol>ds.width or endrow>ds.height:raise ValueError('Window crosses source boundary')
    a=ds.read(1,window=w,masked=True).astype('float32').filled(np.nan)*ds.scales[0]+ds.offsets[0]
    array_hash=hashlib.sha256(np.ascontiguousarray(a,dtype='<f4').tobytes()).hexdigest()
    frozen_path=REFERENCE/'near-far-25km-metadata.json'
    if frozen_path.exists():
      frozen=json.loads(frozen_path.read_text())
      if frozen['window']!=[col,row,int(w.width),int(w.height)] or frozen['array_sha256']!=array_hash:raise ValueError('Near-field window differs from frozen evidence')
      for filename,key in [('horizon-80m.csv','far_csv_sha256'),('horizon-80m-metadata.json','far_metadata_sha256')]:
        if hashlib.sha256((REFERENCE/filename).read_bytes()).hexdigest()!=frozen[key]:raise ValueError('Far-field evidence changed')
    np.savez_compressed(OUTPUT/'source-window.npz',data=a)  # ignored local cache; never overwrite evidence
    obs_row,obs_col=ds.index(X0,Y0); obs_x,obs_y=ds.xy(obs_row,obs_col)
    if not np.allclose([obs_x,obs_y],[X0,Y0],atol=1e-7,rtol=0):raise ValueError('Observer is not at expected 5 m pixel center')
    if not np.isclose(a[obs_row-row,obs_col-col],GROUND_M,atol=1e-5,rtol=0):raise ValueError('Observer DEM value differs from frozen ROI evidence')
    xs=ds.transform.c+(col+np.arange(a.shape[1])+.5)*ds.transform.a
    ys=ds.transform.f+(row+np.arange(a.shape[0])+.5)*ds.transform.e
    xx=xs[None,:]-X0;yy=ys[:,None]-Y0;d=np.hypot(xx,yy)
    ids=np.floor(np.degrees(np.arctan2(xx,yy))%360).astype(int)
    footprint=(d>=MIN_DISTANCE_M)&(d<MAX_DISTANCE_M);valid=footprint&np.isfinite(a)
    angles=np.degrees(np.arctan2(a-OBS_M-d*d/(2*R),d))
    near=np.full(360,-np.inf);np.maximum.at(near,ids[valid],angles[valid]);near[np.isneginf(near)]=np.nan
    count=np.bincount(ids[valid],minlength=360);total=np.bincount(ids[footprint],minlength=360)
    far=list(csv.DictReader((REFERENCE/'horizon-80m.csv').open()))
    if len(far)!=360 or [int(x['grid_azimuth_bin_deg']) for x in far]!=list(range(360)):raise ValueError('Invalid far profile')
    # Any missing cell or bin stays unavailable; do not hide it with the other layer.
    out=[]
    for i in range(360):
      fv=float(far[i]['horizon_deg_25km']) if far[i]['horizon_deg_25km'] else float('nan')
      far_complete=int(far[i]['valid_cells_25km'])==int(far[i]['total_cells_25km']) and int(far[i]['total_cells_25km'])>0
      near_complete=int(count[i])==int(total[i]) and int(total[i])>0
      value=max(near[i],fv) if near_complete and far_complete and np.isfinite(near[i]) and np.isfinite(fv) else float('nan')
      if np.isfinite(value) and (value+1e-12<near[i] or value+1e-12<fv):raise AssertionError('Fusion must dominate both components')
      out.append([i,near[i],fv,value,int(count[i]),int(total[i]),far_complete])
    with (OUTPUT/'near-far-25km.csv').open('w',newline='') as f:
      writer=csv.writer(f,lineterminator='\n');writer.writerow(['grid_azimuth_bin_deg','near_5m_deg','far_80m_deg','combined_deg','near_valid_cells','near_total_cells','far_complete'])
      for rowout in out:writer.writerow([rowout[0],*[('' if not np.isfinite(v) else format(v,'.9f')) for v in rowout[1:4]],*rowout[4:]])
    meta={'status':'conditional experimental 5m+80m azimuth-bin maximum, not validated horizon','source_url':URL,'source_headers':head,'source_shape':[ds.height,ds.width],'source_crs_wkt':ds.crs.to_wkt(),'near_far_crs_semantic_equal':semantic_equal,'near_far_projection_parameters_match':True,'source_transform':list(ds.transform)[:6],'source_scale':ds.scales[0],'source_offset':ds.offsets[0],'source_nodata':str(ds.nodata),'window':[col,row,int(w.width),int(w.height)],'array_sha256':array_hash,'range_requests':traffic['ranges'],'http_body_bytes':traffic['body_bytes'],'observer_xy_m':[X0,Y0],'observer_ground_m':GROUND_M,'height_agl_m':1,'near_distance_m':[MIN_DISTANCE_M,MAX_DISTANCE_M],'far_distance_m':[1000,25000],'near_cells':int(footprint.sum()),'near_valid_cells':int(valid.sum()),'near_empty_bins':int(np.isnan(near).sum()),'near_bins_with_missing':int(np.count_nonzero(count<total)),'combined_available_bins':int(sum(np.isfinite(rowout[3]) for rowout in out)),'far_csv_sha256':hashlib.sha256((REFERENCE/'horizon-80m.csv').read_bytes()).hexdigest(),'far_metadata_sha256':hashlib.sha256((REFERENCE/'horizon-80m-metadata.json').read_bytes()).hexdigest(),'rasterio':rasterio.__version__,'gdal':rasterio.__gdal_version__}
    (OUTPUT/'near-far-25km-metadata.json').write_text(json.dumps(meta,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:meta[k] for k in ('window','near_cells','near_valid_cells','near_empty_bins','near_bins_with_missing','combined_available_bins','http_body_bytes')},indent=2))
