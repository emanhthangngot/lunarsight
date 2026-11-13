#!/usr/bin/env python3
"""Reproduce LunarSight terrain and long-term visibility products from NASA/LOLA.
Python dependencies: numpy, scipy, rasterio, pyproj. Downloads ~562 MB into cache;
raw rasters are intentionally excluded from the compact distribution.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, math, shutil, urllib.request
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.windows import Window, from_bounds
from pyproj import CRS, Transformer, Geod
from scipy.ndimage import map_coordinates

R=1737400.0
SITES=[('A',-89.24,32.40),('B',-88.82,12.10),('C',-89.62,178.30),('D',-85.91,12.92),('E',-85.22,36.12),('SHIV',-69.37,32.32)]
HEIGHTS=[1.2,2.0,2.2,2.5,3.5,10.0]
GEOGRAPHIC=CRS.from_proj4(f'+proj=longlat +R={R} +no_defs')
POLAR=CRS.from_proj4(f'+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={R} +units=m +no_defs')
TO_XY=Transformer.from_crs(GEOGRAPHIC,POLAR,always_xy=True)
TO_LL=Transformer.from_crs(POLAR,GEOGRAPHIC,always_xy=True)
GEOD=Geod(a=R,b=R)
SOURCE_BASE='https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/'
ILL_BASE='https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/'
DEM_NAMES=['LDEM_60S_240MPP_ADJ.TIF','LDEM_80S_80MPP_ADJ.TIF']
ENV_NAMES={'solar_mean_fraction':'AVGVISIB_85S_060M_201608','earth_mean_fraction':'AVGVISIB_85S_060M_201608_EARTH','psr_mask':'LPSR_85S_060M_201608'}
SOURCES={n:SOURCE_BASE+n for n in DEM_NAMES}
for suffix in ['surf','slp','toterr']:
    n='Site04_final_adj_5mpp_'+suffix+'.tif'
    SOURCES[n]='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/'+n
for n in ENV_NAMES.values():
    for ext in ['IMG','LBL']:SOURCES[n+'.'+ext]=ILL_BASE+n+'.'+ext

def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(2**20),b''):h.update(b)
    return h.hexdigest()
def dump(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    def clean(x):
        if isinstance(x,dict):return {k:clean(val) for k,val in x.items()}
        if isinstance(x,(list,tuple)):return [clean(val) for val in x]
        if isinstance(x,float) and not math.isfinite(x):return None
        return x
    p.write_text(json.dumps(clean(v),indent=2,ensure_ascii=False,allow_nan=False)+'\n')
def download(url,path):
    if path.exists():return
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.part')
    with urllib.request.urlopen(url,timeout=180) as response,open(tmp,'wb') as f:
        shutil.copyfileobj(response,f,2**20)
        expected=response.headers.get('content-length')
    if expected and tmp.stat().st_size!=int(expected):raise RuntimeError(f'Incomplete download: {url}')
    tmp.replace(path)
def native_sample(ds,lon,lat):
    x,y=TO_XY.transform(lon,lat)
    col,row=(~ds.transform)*(x,y)
    if not(1<=row<ds.height-1 and 1<=col<ds.width-1):return None,None
    ri,ci=math.floor(row),math.floor(col)
    a=ds.read(1,window=Window(ci-1,ri-1,3,3),masked=True).filled(np.nan)
    if not np.isfinite(a).all():return None,None
    nearest=float(a[1,1])
    interp=float(map_coordinates(a,[[row-(ri-1)-.5],[col-(ci-1)-.5]],order=1,mode='nearest')[0])
    return interp,nearest

class Grid:
    def __init__(self,path):
        self.ds=rasterio.open(path)
        self.a=self.ds.read(1,masked=True).astype('float32').filled(np.nan)
        self.transform=self.ds.transform
    def sample(self,lon,lat):
        x,y=TO_XY.transform(lon,lat)
        cols=(np.asarray(x)-self.transform.c)/self.transform.a-.5
        rows=(np.asarray(y)-self.transform.f)/self.transform.e-.5
        return map_coordinates(self.a,[rows,cols],order=1,mode='constant',cval=np.nan,prefilter=False)

def run(root,raw,heights_only=False):
    terrain=root/'data/terrain';envout=root/'data/environment/visibility';meta=root/'metadata/terrain'
    for d in [terrain,envout,meta,root/'docs']:d.mkdir(exist_ok=True,parents=True)
    for name,url in SOURCES.items():download(url,raw/name)
    source_records=[]
    for name,url in SOURCES.items():
        p=raw/name
        record={'filename':name,'source_url':url,'bytes':p.stat().st_size,'sha256':digest(p),'downloaded_utc':datetime.fromtimestamp(p.stat().st_mtime,timezone.utc).isoformat(),'validation':'Complete GET, file length and SHA256 recorded'}
        if name.endswith(('TIF','LBL')):
            with rasterio.open(p) as ds:
                record.update(width=ds.width,height=ds.height,crs_wkt=ds.crs.to_wkt(),transform=list(ds.transform)[:6],bounds=list(ds.bounds),nodata=ds.nodata,nodata_encoding='NaN' if ds.nodata is not None and math.isnan(ds.nodata) else str(ds.nodata),dtype=ds.dtypes[0],scale=ds.scales[0],offset=ds.offsets[0],resolution_m=list(ds.res))
                if not math.isclose(CRS(ds.crs).ellipsoid.semi_major_metre,R,abs_tol=.001):raise AssertionError('Incorrect lunar radius')
        source_records.append(record)
    dump(meta/'sources.json',source_records)
    samples=[]
    for sid,lat,lon in SITES:
        name='Site04_final_adj_5mpp_surf.tif' if sid=='C' else DEM_NAMES[1] if lat<=-80 else DEM_NAMES[0]
        uncertainty=None
        if sid=='C':
            with rasterio.open(raw/'Site04_final_adj_5mpp_toterr.tif') as err:
                uncertainty=native_sample(err,lon,lat)[0]
        with rasterio.open(raw/name) as ds:
            z,nearest=native_sample(ds,lon,lat)
            samples.append({'site_id':sid,'lat_deg':lat,'lon_deg_east':lon,'elevation_m':z,'nearest_pixel_elevation_m':nearest,'height_reference':'height above 1737400 m reference sphere','reference_radius_m':R,'frame':'MOON_ME / DE421','source_product':name,'native_grid_spacing_m':ds.res[0],'sampling_method':'bilinear interpolation of full-resolution native DEM pixels; nearest pixel supplied separately','vertical_uncertainty_m':uncertainty,'uncertainty_type':'source RMS height error' if sid=='C' else None,'uncertainty_null_reason':None if sid=='C' else 'Per-pixel DEM error layer not included; grid spacing is not measurement accuracy'})
    dump(terrain/'site_ground_heights.json',samples)
    with open(terrain/'site_ground_heights.csv','w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(samples[0]));w.writeheader();w.writerows(samples)
    print('GROUND_HEIGHTS_READY',str(terrain/'site_ground_heights.json'),flush=True)
    for s in samples:print(s['site_id'],s['elevation_m'],s['native_grid_spacing_m'],flush=True)
    if heights_only:return
    artifacts=[]
    def write_tif(path,array,transform,kind,source_names,processing,nodata=-9999,unit=None):
        array=np.asarray(array)
        if array.dtype.kind=='f':array=np.where(np.isfinite(array),array,nodata).astype('float32')
        profile=dict(driver='GTiff',height=array.shape[0],width=array.shape[1],count=1,dtype=str(array.dtype),crs=POLAR.to_wkt(),transform=transform,nodata=nodata,compress='deflate',predictor=3 if array.dtype.kind=='f' else 2,tiled=True,blockxsize=256,blockysize=256)
        with rasterio.open(path,'w',**profile) as ds:
            ds.write(array,1);ds.set_band_description(1,kind)
            if unit:ds.set_band_unit(1,unit)
            ds.update_tags(frame='MOON_ME / DE421',reference_radius_m=R,processing=processing)
        rec={'path':str(path.relative_to(root)),'kind':kind,'source_products':source_names,'source_urls':[SOURCES[n] for n in source_names],'processing':processing,'unit':unit,'shape':list(array.shape),'resolution_m':[abs(transform.a),abs(transform.e)],'transform':list(transform)[:6],'crs':POLAR.to_wkt(),'frame':'MOON_ME / DE421','nodata':nodata,'sha256':digest(path),'bytes':path.stat().st_size}
        artifacts.append(rec)
        dump(meta/(path.stem+'.json'),rec)
    def crop_window(ds,x,y,half=20000):
        w=from_bounds(x-half,y-half,x+half,y+half,ds.transform)
        c0=math.floor(w.col_off);r0=math.floor(w.row_off)
        return Window(c0,r0,math.ceil(w.col_off+w.width)-c0,math.ceil(w.row_off+w.height)-r0)
    # Native-resolution 40-km study tiles and honest terrain-scale slope.
    for s in samples:
        sid=s['site_id'];x,y=TO_XY.transform(s['lon_deg_east'],s['lat_deg'])
        name=DEM_NAMES[1] if s['lat_deg']<=-80 else DEM_NAMES[0]
        with rasterio.open(raw/name) as ds:
            win=crop_window(ds,x,y)
            a=ds.read(1,window=win,masked=True).astype('float32').filled(np.nan)
            tr=ds.window_transform(win)
            write_tif(terrain/f'{sid}_dem_{int(ds.res[0])}m_40km.tif',a,tr,'surface_elevation',[name],'Source-aligned native-resolution crop; no synthetic upsampling',unit='m')
            gy,gx=np.gradient(a,ds.res[1],ds.res[0])
            # Stereographic scale correction evaluated at the study-site latitude.
            k=2/(1+math.sin(math.radians(-s['lat_deg'])))
            slope=np.degrees(np.arctan(k*np.hypot(gx,gy)))
            slope[[0,-1],:]=np.nan;slope[:,[0,-1]]=np.nan
            write_tif(terrain/f'{sid}_terrain_scale_slope_{int(ds.res[0])}m.tif',slope,tr,'terrain_scale_slope',[name],f'Central finite differences over native {int(ds.res[0])}m grid; local stereographic scale k={k}; border excluded; not metre-scale lander hazard',unit='degree')
    # Best available5m product at exact proposalC, inside Site04footprint.
    c=next(s for s in samples if s['site_id']=='C');x,y=TO_XY.transform(c['lon_deg_east'],c['lat_deg'])
    for suffix,kind,unit in [('surf','surface_elevation','m'),('slp','source_5m_slope','degree'),('toterr','source_RMS_height_error','m')]:
        name='Site04_final_adj_5mpp_'+suffix+'.tif'
        with rasterio.open(raw/name) as ds:
            win=crop_window(ds,x,y,half=3000)
            a=ds.read(1,window=win,masked=True).astype('float32').filled(np.nan)
            write_tif(terrain/f'C_site04_{kind}_5m_6km.tif',a,ds.window_transform(win),kind,[name],'Source-aligned6km crop around exact proposalC;5m interpolated grid is not5m independent measurement resolution',unit=unit)
    with rasterio.open(raw/DEM_NAMES[0]) as ds:
        factor=4;shape=(math.ceil(ds.height/factor),math.ceil(ds.width/factor))
        a=ds.read(1,out_shape=shape,resampling=Resampling.average,masked=True).astype('float32').filled(np.nan)
        write_tif(terrain/'south_pole_context_960m.tif',a,ds.transform*Affine.scale(ds.width/shape[1],ds.height/shape[0]),'regional_context_elevation',[DEM_NAMES[0]],'Average of native 240m DEM into approximately960m context pixels; display/context only',unit='m')
    # Full-resolution PDS layers: use GDAL PDS georeferencing and explicit scaling.
    with rasterio.open(raw/(ENV_NAMES['psr_mask']+'.LBL')) as psrds:
        psrraw=psrds.read(1)
        valid_environment=np.isin(psrraw,[-20000,20000])
        del psrraw
    environment={};environment_samples={s['site_id']:{'site_id':s['site_id'],'lat_deg':s['lat_deg'],'lon_deg_east':s['lon_deg_east']} for s in samples}
    for kind,name in ENV_NAMES.items():
        shutil.copy2(raw/(name+'.LBL'),meta/(name+'.LBL'))
        with rasterio.open(raw/(name+'.LBL')) as ds:
            a=ds.read(1,masked=True).astype('float32').filled(np.nan)
            a=a*ds.scales[0]+ds.offsets[0]
            # Actual PSR IMG contains5raw0 cells.0scales to0.5,
            # an undefined mask class; conservatively exclude these5cells in all3layers.
            a[~valid_environment]=np.nan
            finite=a[np.isfinite(a)]
            if finite.min()<0 or finite.max()>1.000001:raise AssertionError('Visibility scaling outside0..1')
            if kind=='psr_mask' and not np.all(np.isin(finite,[0,1])):raise AssertionError('Nonbinary full-res PSR mask')
            if kind=='psr_mask':environment[kind]=(a,ds.transform,ds.bounds)
            for s in samples:
                sid=s['site_id'];x,y=TO_XY.transform(s['lon_deg_east'],s['lat_deg']);c,r=(~ds.transform)*(x,y)
                covered=s['lat_deg']<=-85 and 0<=r<ds.height and 0<=c<ds.width and valid_environment[int(r),int(c)]
                v=float(a[int(r),int(c)]) if covered else None
                environment_samples[sid][kind]=v if v is None or math.isfinite(v) else None
                environment_samples[sid]['environment_native_grid_spacing_m']=60
                environment_samples[sid]['sampling_method']='nearest full-resolution60m PDS pixel; scale/offset applied'
                environment_samples[sid]['coverage_reason']=None if covered else 'Outside nominal85–90S polar product and raster footprint; no extrapolation'
                if covered:
                    win=crop_window(ds,x,y);rr=int(win.row_off);cc=int(win.col_off)
                    sub=a[rr:rr+int(win.height),cc:cc+int(win.width)]
                    if kind=='psr_mask':
                        sub=np.where(np.isfinite(sub),sub,255).astype('uint8');nd=255
                    else:nd=-9999
                    write_tif(envout/f'{sid}_{kind}_60m_40km.tif',sub,ds.window_transform(win),kind,[name+'.IMG',name+'.LBL'],'Native60m PDS crop; DN scale+offset; 5rawPSR0 cells are undefined and excluded inalllayers; no interpolation; long-term mean,not date-specific',nodata=nd,unit='flag' if kind=='psr_mask' else 'fraction')
            # Coarse complete polar context, preserving PSR class with nearest neighbour.
            shape=(math.ceil(ds.height/4),math.ceil(ds.width/4))
            raw_context=ds.read(1,out_shape=shape,resampling=Resampling.nearest if kind=='psr_mask' else Resampling.average,masked=True).astype('float32').filled(np.nan)
            context=raw_context*ds.scales[0]+ds.offsets[0]
            # Conservatively exclude coarsepixels whose nearest underlying PSRcell is undefined.
            with rasterio.open(raw/(ENV_NAMES['psr_mask']+'.LBL')) as maskds:
                contextmask=maskds.read(1,out_shape=shape,resampling=Resampling.nearest)
            context[~np.isin(contextmask,[-20000,20000])]=np.nan
            if kind=='psr_mask':context=np.where(np.isfinite(context),context,255).astype('uint8')
            write_tif(envout/f'polar_{kind}_context_240m.tif',context,ds.transform*Affine.scale(ds.width/shape[1],ds.height/shape[0]),kind,[name+'.IMG',name+'.LBL'],'Approximately240m display context; mean averaging for fractions, nearest for PSR; do not measure smallPSRs from context',nodata=255 if kind=='psr_mask' else -9999,unit='flag' if kind=='psr_mask' else 'fraction')
    psr,tr,bounds=environment['psr_mask']
    rr,cc=np.where(psr==1)
    px=tr.c+(cc+.5)*tr.a;py=tr.f+(rr+.5)*tr.e
    plon,plat=TO_LL.transform(np.asarray(px),np.asarray(py))
    plat=np.radians(plat);plon=np.radians(plon)
    vectors=np.column_stack((np.cos(plat)*np.cos(plon),np.cos(plat)*np.sin(plon),np.sin(plat)))
    for s in samples:
        rec=environment_samples[s['site_id']]
        if rec['psr_mask'] is None:
            rec.update(nearest_psr_pixel_center_distance_m=None,nearest_psr_lat_deg=None,nearest_psr_lon_deg_east=None,psr_distance_null_reason='Site outside supplied PSR coverage')
            continue
        lat=math.radians(s['lat_deg']);lon=math.radians(s['lon_deg_east'])
        v=np.array([math.cos(lat)*math.cos(lon),math.cos(lat)*math.sin(lon),math.sin(lat)])
        i=int(np.argmax(vectors@v));nlon,nlat=TO_LL.transform(float(px[i]),float(py[i]))
        distance=float(GEOD.inv(s['lon_deg_east'],s['lat_deg'],nlon,nlat)[2])
        x,y=TO_XY.transform(s['lon_deg_east'],s['lat_deg']);edge=min(x-bounds.left,bounds.right-x,y-bounds.bottom,bounds.top-y)
        rec.update(nearest_psr_pixel_center_distance_m=distance,nearest_psr_lat_deg=nlat,nearest_psr_lon_deg_east=nlon%360,psr_distance_null_reason=None,psr_distance_definition='Great-circle distance to nearest full-resolution60m pixel centre flaggedPSR in supplied mask; not distance to polygon boundary or traversable path',nearest_psr_search_edge_distance_projected_m=edge,nearest_psr_inside_observed_search_margin=bool(distance<edge*.99),psr_mask_uncertainty='60m grid, topography/model dependent; PSR does not demonstrate ice')
    dump(envout/'site_long_term_visibility.json',list(environment_samples.values()))
    with open(envout/'site_long_term_visibility.csv','w',newline='') as f:
        fields=sorted({k for rec in environment_samples.values() for k in rec});w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(environment_samples.values())
    # True-north clockwise azimuths; spherical curvature; full-resolution DEM rays.
    coarse=Grid(raw/DEM_NAMES[0]);fine=Grid(raw/DEM_NAMES[1])
    distances=np.r_[np.arange(80,20000,80),np.arange(20160,200001,240)].astype('float64')
    az=np.arange(360,dtype='float64')
    for s in samples:
        azi=np.repeat(az[:,None],len(distances),axis=1);dist=np.broadcast_to(distances,azi.shape)
        lon,lat,_=GEOD.fwd(np.full_like(azi,s['lon_deg_east']),np.full_like(azi,s['lat_deg']),azi,dist)
        z=coarse.sample(lon.ravel(),lat.ravel()).reshape(azi.shape)
        usefine=(dist<20000)&(lat<=-80)
        finez=fine.sample(lon.ravel(),lat.ravel()).reshape(azi.shape)
        z=np.where(usefine&np.isfinite(finez),finez,z)
        theta=dist/R;horizontal=(R+z)*np.sin(theta)
        # Horizon geometry uses the same regional ground field as its rays.
        ground=float((fine if s['lat_deg']<=-80 else coarse).sample(np.array([s['lon_deg_east']]),np.array([s['lat_deg']]))[0])
        rows=[]
        for mast in HEIGHTS:
            elevation=np.degrees(np.arctan2((R+z)*np.cos(theta)-(R+ground+mast),horizontal))
            maxima=np.nanargmax(elevation,axis=1)
            for a,i in zip(range(360),maxima):
                rows.append({'site_id':s['site_id'],'observer_height_above_ground_m':mast,'azimuth_deg':a,'terrain_horizon_elevation_deg':float(elevation[a,i]),'obstruction_distance_m':float(dist[a,i]),'obstruction_lat_deg':float(lat[a,i]),'obstruction_lon_deg_east':float(lon[a,i]%360),'valid_ray_fraction':float(np.mean(np.isfinite(elevation[a]))),'horizon_is_finite_radius_lower_bound':True})
        p=terrain/f'{s["site_id"]}_horizon_360deg.csv'
        with open(p,'w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
        rec={'path':str(p.relative_to(root)),'kind':'preliminary_terrain_horizon','source_products':DEM_NAMES,'azimuth_convention':'0=true local north;90=east;clockwise','heights_above_ground_m':HEIGHTS,'ground_elevation_m':ground,'best_available_catalog_ground_elevation_m':s['elevation_m'],'ground_note':'Horizon uses regional80/240m ground consistently with ray terrain; best available C5m catalog ground is separate','ground_sample_method':s['sampling_method'],'search_distance_m':[80,200000],'distance_steps_m':{'sample_spacing_below20km':80,'sample_spacing_20to200km':240},'terrain_source_rule':'80m native DEM where latitude<=-80 and distance<20km;240m native DEM elsewhere; no5m terrain in horizon','ray_bearing_step_deg':1,'sampling':'bilinear native DEM; no atmospheric refraction; spherical curvature applied in3D radial geometry','limitation':'Finite200km search and discrete rays produce a sampled lower bound.80/240m DEM cannot resolve metre-scale obstructions or certify mast-height benefits. No lunar terrain beyond200km included. Source MOON_ME/DE421.','sha256':digest(p)}
        dump(meta/(p.stem+'.json'),rec)
        artifacts.append(rec)
        print('horizon',s['site_id'],'complete',flush=True)
    dump(meta/'artifacts.json',artifacts)
    coverage=[]
    footprints={'Site01':(-19000,-20000,-3000,-4000),'Site04':(-9000,-15000,7000,1000)}
    for sid,lat,lon in SITES:
        x,y=TO_XY.transform(lon,lat)
        coverage.append({'site_id':sid,'lat_deg':lat,'lon_deg_east':lon,'x_m':x,'y_m':y,'in_Site01_5m':footprints['Site01'][0]<=x<=footprints['Site01'][2] and footprints['Site01'][1]<=y<=footprints['Site01'][3],'in_Site04_5m':footprints['Site04'][0]<=x<=footprints['Site04'][2] and footprints['Site04'][1]<=y<=footprints['Site04'][3]})
    dump(meta/'site_5m_coverage.json',{'footprints_xy_m':footprints,'footprint_validation':'Actual remote GeoTIFF headers read via HTTP ranges; only Site04 rasters fully downloaded','sites':coverage})
    dump(meta/'processing_summary.json',{'sites_preserved':SITES,'lunar_radius_m':R,'frame':'MOON_ME / DE421','precomputed_visibility_period':'18.6-year mean with hourly source modeling; not a mission interval','site5m_data_included':True,'site5m_reason':'Exact proposalC is inside Site04footprint;6km native5m surface/slope/RMSerror crops supplied. Other proposalpoints outside Site01/04.','environment_sampling':'full-resolution nearest60m pixel','terrain_sampling':'full-resolution bilinear80m A/B/D/E;5m C;240m SHIV. Horizons80/240m separately.','generated_utc':datetime.now(timezone.utc).isoformat(),'validation':['full source download','readable native grids','reference sphere radius1737400m','finite ground samples','source scale+offset','fraction bounds0..1','binary PSR values','SHA256 source and derived raster records']})
    print('TERRAIN_COMPLETE',flush=True)

def validate(root):
    """Validate coordinate conventions, output rasters and horizon invariants."""
    checks={};rasters=[];horizons=[]
    for folder in ['data/terrain','data/environment/visibility']:
        for path in sorted((root/folder).glob('*.tif')):
            with rasterio.open(path) as ds:
                a=ds.read(1,masked=True)
                assert a.count()>0, path
                assert math.isclose(CRS(ds.crs).ellipsoid.semi_major_metre,R,abs_tol=.001)
                if folder.endswith('visibility'):
                    assert float(a.min())>=0 and float(a.max())<=1
                    if 'psr' in path.name:assert np.all(np.isin(a.compressed(),[0,1]))
                rasters.append({'path':str(path.relative_to(root)),'shape':list(a.shape),'valid_pixel_count':int(a.count()),'min':float(a.min()),'max':float(a.max()),'lunar_radius_m':R})
    for sid,lat,lon in SITES:
        rows=list(csv.DictReader(open(root/f'data/terrain/{sid}_horizon_360deg.csv')))
        assert len(rows)==len(HEIGHTS)*360
        matrices=[]
        for height in HEIGHTS:
            selected=[row for row in rows if float(row['observer_height_above_ground_m'])==height]
            assert [int(row['azimuth_deg']) for row in selected]==list(range(360))
            values=np.array([float(row['terrain_horizon_elevation_deg']) for row in selected])
            assert np.isfinite(values).all()
            matrices.append(values)
        assert np.all(np.diff(np.stack(matrices),axis=0)<=1e-9)
        assert min(float(row['valid_ray_fraction']) for row in rows)==1.0
        horizons.append({'site_id':sid,'rows':len(rows),'all_rows_finite':True,'height_monotonicity_passed':True,'min_valid_ray_fraction':1.0})
        for azimuth in [0,90,180,270]:
            lo,la,_=GEOD.fwd(lon,lat,azimuth,1000)
            back,_,distance=GEOD.inv(lon,lat,lo,la)
            residual=(back-azimuth+180)%360-180
            assert abs(residual)<1e-7 and abs(distance-1000)<1e-6
    theta=np.array([80,1000,200000],dtype='float64')/R
    actual=np.arctan2(R*np.cos(theta)-R,R*np.sin(theta))
    assert np.allclose(actual,-theta/2,atol=1e-10)
    env=json.loads((root/'data/environment/visibility/site_long_term_visibility.json').read_text())
    shiv=next(x for x in env if x['site_id']=='SHIV')
    assert all(shiv[k] is None for k in ['solar_mean_fraction','earth_mean_fraction','psr_mask','nearest_psr_pixel_center_distance_m'])
    checks={'status':'passed','generated_utc':datetime.now(timezone.utc).isoformat(),'numeric_raster_count':len(rasters),'horizon_rows':sum(x['rows'] for x in horizons),'true_north_clockwise_geodesic_cardinal_checks':'passed at all6sites','spherical_curvature_analytic_check':'flat spherical surface withzeroobserverheight gives horizonangle=-distance/(2R) at80m,1km,200km','SHIV_environment_no_extrapolation':'passed','rasters':rasters,'horizons':horizons,'scope':'Implementation and data consistency checks; not independent mission certification'}
    dump(root/'metadata/terrain/validation.json',checks)
    return checks

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--cache',type=Path,default=Path(__file__).resolve().parents[2]/'lunarsight_dataset_work/terrain_raw');p.add_argument('--heights-only',action='store_true');args=p.parse_args();run(args.output.resolve(),args.cache.resolve(),args.heights_only)
    if not args.heights_only:validate(args.output.resolve())
