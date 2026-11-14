"""Compare planar-curvature approximation with spherical-vector geometry, same samples."""
from pathlib import Path
import csv,json,math,hashlib
import numpy as np
P=Path('notebooks/evidence/site04-case');A=Path('artifacts/site04-case');m=json.loads((P/'horizon-80m-metadata.json').read_text());fresh=json.loads((A/'horizon-80m-metadata.json').read_text())
with np.load(A/'source-window.npz',allow_pickle=False) as f:z=f['data']
hash_=hashlib.sha256(np.ascontiguousarray(z,dtype='<f4').tobytes()).hexdigest();assert hash_==m['window_sha256']==fresh['window_sha256']
col,row,w,h=m['window'];t=fresh['source_transform'];assert z.shape==(h,w) and t[1]==0 and t[3]==0
R=1737400.;x0,y0=m['observer_xy_m'];z0=m['observer_ground_m']+m['observer_height_agl_m']
x=t[2]+(col+np.arange(w)+.5)*t[0];y=t[5]+(row+np.arange(h)+.5)*t[4];xx=x[None,:];yy=y[:,None];rho=np.hypot(xx,yy)
lat=2*np.arctan(rho/(2*R))-np.pi/2;lon=np.arctan2(xx,yy)
lat0=2*math.atan(math.hypot(x0,y0)/(2*R))-math.pi/2;lon0=math.atan2(x0,y0)
coslat=np.cos(lat);ux=coslat*np.cos(lon);uy=coslat*np.sin(lon);uz=np.sin(lat)
u0=np.array([math.cos(lat0)*math.cos(lon0),math.cos(lat0)*math.sin(lon0),math.sin(lat0)])
e=np.array([-math.sin(lon0),math.cos(lon0),0]);n=np.array([-math.sin(lat0)*math.cos(lon0),-math.sin(lat0)*math.sin(lon0),math.cos(lat0)])
dot_u=ux*u0[0]+uy*u0[1]+uz*u0[2];dot_e=ux*e[0]+uy*e[1];dot_n=ux*n[0]+uy*n[1]+uz*n[2]
vertical=(R+z)*dot_u-(R+z0);horizontal=(R+z)*np.hypot(dot_e,dot_n)
exact=np.degrees(np.arctan2(vertical,horizontal));bearing=np.floor(np.degrees(np.arctan2(dot_e,dot_n))%360).astype(int)
d=np.hypot(xx-x0,yy-y0);valid=np.isfinite(z)&(d>=1000)&(d<=25000);approx=np.degrees(np.arctan2(z-z0-d*d/(2*R),d))
exactmax=np.full(360,-np.inf);approxmax=np.full(360,-np.inf);np.maximum.at(exactmax,bearing[valid],exact[valid]);np.maximum.at(approxmax,bearing[valid],approx[valid]);assert np.all(np.isfinite(exactmax)) and np.all(np.isfinite(approxmax))
difference=approxmax-exactmax;out=A/'spherical-crosscheck.csv'
with out.open('w',newline='') as f:
 writer=csv.writer(f,lineterminator='\n');writer.writerow(['true_azimuth_bin_deg','spherical_vector_max_deg','planar_approx_max_same_bins_deg','planar_minus_spherical_deg']);writer.writerows([[i,*[format(v,'.12f') for v in (exactmax[i],approxmax[i],difference[i])]] for i in range(360)])
meta={'scope':'same 80m samples, same 1–25km projected distance mask and true-azimuth bins; not external reference or terrain validation','source_window_sha256':hash_,'output_csv_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'median_abs_deg':float(np.median(np.abs(difference))),'p95_abs_deg':float(np.percentile(np.abs(difference),95)),'max_abs_deg':float(np.max(np.abs(difference))),'bins':360,'observer_vertical_datum':'conditional, same sphere 1737400 m'};(A/'spherical-crosscheck-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta,indent=2))
