#!/usr/bin/env python3
"""Render a scientific preview of the actual native regional terrain crops."""
from pathlib import Path
import json
import numpy as np
import rasterio
from pyproj import CRS,Transformer
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
sites=json.loads((ROOT/'data/catalog/sites.json').read_text())
fig,axes=plt.subplots(2,3,figsize=(14,11),facecolor='#f5f6f8')
fig.subplots_adjust(left=.065,right=.88,bottom=.12,top=.855,wspace=.24,hspace=.46)
for site,ax in zip(sites,axes.flat):
    sid=site['site_id'];p=next((ROOT/'data/terrain').glob(f'{sid}_dem_*m_40km.tif'))
    with rasterio.open(p) as ds:
        a=ds.read(1,masked=True)/1000
        tr=Transformer.from_crs(CRS(ds.crs).geodetic_crs,ds.crs,always_xy=True)
        x,y=tr.transform(site['lon_deg_east'],site['lat_deg'])
        b=ds.bounds;extent=[(b.left-x)/1000,(b.right-x)/1000,(b.bottom-y)/1000,(b.top-y)/1000]
        im=ax.imshow(a,extent=extent,origin='upper',cmap='terrain',vmin=-4,vmax=7.2,interpolation='nearest')
        ax.scatter([0],[0],s=85,facecolors='none',edgecolors='white',linewidths=2,zorder=5)
        ax.scatter([0],[0],s=15,color='#b4142a',zorder=6)
        ax.set_title(f"{sid} · {site['lat_deg']:.2f}°, {site['lon_deg_east']:.2f}°E\nNative regional grid: {ds.res[0]:.0f} m",fontsize=11,weight='bold')
        ax.set_xticks([-20,-10,0,10,20]);ax.set_yticks([-20,-10,0,10,20]);ax.tick_params(labelsize=8)
        ax.set_xlabel('Polar-projection x offset (km)',fontsize=9)
        ax.set_ylabel('Polar-projection y offset (km)',fontsize=9)
        ax.set_aspect('equal')
cax=fig.add_axes([.905,.22,.022,.53])
fig.colorbar(im,cax=cax,orientation='vertical',label='Elevation above 1737.4 km reference sphere (km)')
fig.suptitle('LunarSight · Actual terrain at the six proposal coordinates\nLOLA/PGDA crops; coordinates preserved from the proposal',fontsize=16,weight='bold',y=.975)
fig.text(.48,.035,'Each panel covers approximately 40 × 40 km. This common-scale view uses regional DEMs.\nA separate 5 m terrain crop at C is also included in the pack.',ha='center',fontsize=10)
(ROOT/'docs').mkdir(exist_ok=True)
fig.savefig(ROOT/'docs/terrain_preview.png',dpi=150,facecolor=fig.get_facecolor())
plt.close(fig)
print('Wrote docs/terrain_preview.png')
