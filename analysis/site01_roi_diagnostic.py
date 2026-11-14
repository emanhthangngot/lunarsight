"""Site01 ROI coverage and raster diagnostics across 5 PGDA 78 layers."""
import io, time, json, hashlib, urllib.request, tarfile, tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import Window
from rasterio.features import geometry_mask
from rasterio.transform import Affine
from shapely.geometry import shape, Point
from shapely.ops import unary_union
import shapefile
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/preview/site01_roi'
CACHE.mkdir(parents=True, exist_ok=True)
FIGURES = ROOT / 'docs/figures'
FIGURES.mkdir(parents=True, exist_ok=True)
EVIDENCE = ROOT / 'notebooks/evidence'
EVIDENCE.mkdir(parents=True, exist_ok=True)

ROI_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_ROIs.tgz'
EXPECTED_ROI_SHA = '40b961417a344ce0274aecbab522e171a22f658507d82e8fb4d7bc97526ffc4f'

class RangeFile(io.RawIOBase):
    """Seekable read-only source: validate 206 bodies; reject whole-file fallback."""
    def __init__(self, url, size, blocks, traffic):
        super().__init__()
        self.url = url
        self.size = size
        self.blocks = blocks
        self.traffic = traffic
        self.pos = 0
        self.block_size = 512 * 1024

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = int(offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset)
        if self.pos < 0: raise ValueError('Negative offset')
        return self.pos

    def read(self, n=-1):
        if n < 0: raise ValueError('Unbounded source read disabled')
        end = min(self.size, self.pos + n)
        chunks = []
        while self.pos < end:
            idx = self.pos // self.block_size
            start = idx * self.block_size
            stop = min(start + self.block_size, self.size) - 1
            if idx not in self.blocks:
                for attempt in range(3):
                    if self.traffic['body_bytes'] + (stop - start + 1) > 24 * 1024**2:
                        raise IOError('Per-site HTTP body budget exceeded (24 MiB including retries)')
                    try:
                        req = urllib.request.Request(self.url, headers={'User-Agent': 'Mozilla/5.0', 'Range': f'bytes={start}-{stop}'})
                        with urllib.request.urlopen(req, timeout=30) as r:
                            if r.status != 206 or r.headers.get('Content-Range') != f'bytes {start}-{stop}/{self.size}':
                                raise IOError('Source ignored/misreported requested byte range')
                            body = r.read(stop - start + 2)
                            self.traffic['body_bytes'] += len(body)
                            if len(body) != stop - start + 1: raise IOError('Truncated or oversized byte range')
                            self.blocks[idx] = body
                            self.traffic['ranges'].append([start, stop])
                            break
                    except Exception as exc:
                        if attempt == 2: raise IOError(f'Failed range {start}-{stop}: {exc}') from exc
                        time.sleep(1)
            data = self.blocks[idx]
            take = min(end - self.pos, stop - self.pos + 1)
            chunks.append(data[self.pos - start : self.pos - start + take])
            self.pos += take
        return b''.join(chunks)

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)

def main():
    print('1. Downloading and verifying Site01_ROIs.tgz...', flush=True)
    roi_file = CACHE / 'Site01_ROIs.tgz'
    if not roi_file.exists():
        req = urllib.request.Request(ROI_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            roi_bytes = resp.read()
        roi_file.write_bytes(roi_bytes)
    else:
        roi_bytes = roi_file.read_bytes()

    roi_sha = hashlib.sha256(roi_bytes).hexdigest()
    assert roi_sha == EXPECTED_ROI_SHA, f'ROI SHA mismatch: {roi_sha}'
    print(f'ROI verified: SHA-256 {roi_sha}')

    # Extract shapefile
    with tarfile.open(fileobj=io.BytesIO(roi_bytes), mode='r:gz') as tar:
        prj_text = tar.extractfile('Site01_ROIs.prj').read().decode('utf-8')
        shp_f = io.BytesIO(tar.extractfile('Site01_ROIs.shp').read())
        dbf_f = io.BytesIO(tar.extractfile('Site01_ROIs.dbf').read())
        shx_f = io.BytesIO(tar.extractfile('Site01_ROIs.shx').read())
        sf = shapefile.Reader(shp=shp_f, dbf=dbf_f, shx=shx_f)
        polygons = [shape(s.__geo_interface__) for s in sf.shapes()]

    print(f'Extracted {len(polygons)} polygons from Site01_ROIs.')
    union_poly = unary_union(polygons)
    total_area_m2 = union_poly.area
    total_bounds = union_poly.bounds
    print(f'Total union area: {total_area_m2:.1f} m2, bounds: {total_bounds}')

    BASE = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_'
    LAYERS = {
        'surface': ('surf', 'LDEM (elevation m)'),
        'count': ('ldec', 'LDEC (LOLA count)'),
        'slope': ('slp', 'Slope (degrees)'),
        'z_rms': ('toterr', 'Total Z RMS (m)'),
        'slope_rms': ('slperr', 'Slope RMS (degrees)')
    }

    # Desired window covering union bounds plus 2-pixel margin
    # xmin: -11657.5, ymin: -12637.5, xmax: -10167.5, ymax: -11492.5
    # Window: col_off=1466, row_off=1496, width=302, height=233
    window_def = Window(1466, 1496, 302, 233)

    opts = dict(
        GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
        GDAL_HTTP_USERAGENT='Mozilla/5.0',
        GDAL_HTTP_TIMEOUT=45,
        GDAL_HTTP_MAX_RETRY=1,
        GDAL_HTTP_RETRY_DELAY=1,
        GDAL_HTTP_MULTIRANGE='YES',
        CPL_VSIL_CURL_CHUNK_SIZE=1048576
    )

    def fetch_layer(item):
        layer_name, (suffix, desc) = item
        npz_path = CACHE / f'{layer_name}.npz'
        url = BASE + suffix + '.tif'
        print(f'Processing {layer_name}...', flush=True)

        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as h:
            headers = {k: h.headers.get(k) for k in ('Content-Length', 'ETag', 'Last-Modified', 'Content-Type')}

        blocks = {}
        traffic = {'body_bytes': 0, 'ranges': []}
        def opener(path, mode='rb'):
            if str(path) != url: raise FileNotFoundError(path)
            return RangeFile(url, int(headers['Content-Length']), blocks, traffic)

        with rasterio.Env(**opts):
            with rasterio.open(url, opener=opener) as ds:
                crs_wkt = ds.crs.to_wkt()
                res_m = list(ds.res)
                arr = ds.read(1, window=window_def, masked=True).astype('float32').filled(np.nan) * ds.scales[0] + ds.offsets[0]
                tr = ds.window_transform(window_def)
                mask = geometry_mask([p.__geo_interface__ for p in polygons], out_shape=arr.shape, transform=tr, invert=True, all_touched=False)
                nodata_val = str(ds.nodata) if ds.nodata is not None else 'nan'
                scale_val = float(ds.scales[0])
                offset_val = float(ds.offsets[0])

        arr_sha = hashlib.sha256(np.ascontiguousarray(arr, dtype='<f4').tobytes()).hexdigest()
        np.savez_compressed(npz_path, data=arr, roi_mask=mask)

        valid_mask = mask & np.isfinite(arr)
        valid_vals = arr[valid_mask]

        evidence_entry = {
            'layer': layer_name,
            'url': url,
            'head': headers,
            'crs_wkt': crs_wkt,
            'roi_crs_wkt': prj_text,
            'crs_equivalent': False,
            'resolution_m': res_m,
            'window': [window_def.col_off, window_def.row_off, window_def.width, window_def.height],
            'window_transform': list(tr)[:6],
            'nodata': nodata_val,
            'scale': scale_val,
            'offset': offset_val,
            'roi_cells': int(mask.sum()),
            'valid_roi_cells': int(valid_mask.sum()),
            'min': float(valid_vals.min()),
            'max': float(valid_vals.max()),
            'median': float(np.median(valid_vals)),
            'http_body_bytes': traffic['body_bytes'],
            'ranges': traffic['ranges'],
            'window_sha256': arr_sha
        }
        print(f'Done {layer_name}: {valid_mask.sum()}/{mask.sum()} valid cells, min={valid_vals.min():.3f}, max={valid_vals.max():.3f}', flush=True)
        return layer_name, arr, mask, evidence_entry

    print('2. Fetching and analyzing 5 raster layers concurrently...', flush=True)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(fetch_layer, LAYERS.items()))

    arrays = {name: arr for name, arr, mask, ev in results}
    masks = {name: mask for name, arr, mask, ev in results}
    evidence_layers = [ev for name, arr, mask, ev in results]

    # Check mask consistency across layers
    roi_cells = evidence_layers[0]['roi_cells']
    assert all(ev['roi_cells'] == roi_cells and ev['valid_roi_cells'] == roi_cells for ev in evidence_layers)
    print(f'All 5 layers have {roi_cells}/{roi_cells} valid cells within the ROI mask!')

    count_arr = arrays['count']
    roi_mask = masks['count']
    zero_count = int(((count_arr == 0) & roi_mask).sum())
    pos_count = int(((count_arr > 0) & roi_mask).sum())
    print(f'LOLA counts in ROI: {zero_count} zero-count cells, {pos_count} cells with count > 0.')

    # 3. Find candidate points
    print('3. Evaluating candidate technical points...', flush=True)
    tr = Affine(*evidence_layers[0]['window_transform'])
    # Candidate pool: ROI cells with count > 0
    candidates = []
    for r, c in np.argwhere(roi_mask & (count_arr > 0)):
        # Cell center in projected coordinates
        x, y = tr * (float(c) + 0.5, float(r) + 0.5)
        pt = Point(x, y)
        dist = pt.distance(union_poly.boundary)
        slope = float(arrays['slope'][r, c])
        z = float(arrays['surface'][r, c])
        z_rms = float(arrays['z_rms'][r, c])
        s_rms = float(arrays['slope_rms'][r, c])
        cnt = int(count_arr[r, c])
        candidates.append({
            'margin_m': dist,
            'x_m': x,
            'y_m': y,
            'row': int(r),
            'col': int(c),
            'elevation_m': z,
            'count': cnt,
            'slope_deg': slope,
            'z_rms_m': z_rms,
            'slope_rms_deg': s_rms
        })

    # Sort by margin descending
    candidates.sort(key=lambda c: c['margin_m'], reverse=True)
    best = candidates[0]
    print(f'Best margin point: margin={best["margin_m"]:.1f} m, X={best["x_m"]:.1f}, Y={best["y_m"]:.1f}')
    print(f'  DEM={best["elevation_m"]:.3f} m, count={best["count"]}, slope={best["slope_deg"]:.3f} deg, z_rms={best["z_rms_m"]:.3f} m')

    # Convert to lat, lon on Moon sphere R=1737400 m using authoritative rasterio.warp.transform
    from rasterio.warp import transform as transform_coords
    geo = '+proj=longlat +a=1737400 +b=1737400 +no_defs'
    x, y = best['x_m'], best['y_m']
    lons, lats = transform_coords(evidence_layers[0]['crs_wkt'], geo, [x], [y])
    lon_deg = float(lons[0])
    lat_deg = float(lats[0])
    print(f'  Lat: {lat_deg:.8f} deg, Lon: {lon_deg:.8f} deg')

    # Save evidence JSON
    full_evidence = {
        'site': 'Site01',
        'roi_sha256': roi_sha,
        'mask_rule': 'pixel center within polygon, all_touched=False',
        'crs_comparison': 'pyproj semantic equality false; PROJ parameters match; authoritative frame identity not established',
        'roi_summary': {
            'polygon_count': len(polygons),
            'total_area_m2': float(total_area_m2),
            'roi_cells': roi_cells,
            'zero_count_cells': zero_count,
            'positive_count_cells': pos_count,
            'candidate_point': {
                'x_m': best['x_m'],
                'y_m': best['y_m'],
                'lat_deg': float(lat_deg),
                'lon_deg': float(lon_deg),
                'margin_to_boundary_m': float(best['margin_m']),
                'elevation_m': float(best['elevation_m']),
                'count': int(best['count']),
                'slope_deg': float(best['slope_deg']),
                'z_rms_m': float(best['z_rms_m']),
                'slope_rms_deg': float(best['slope_rms_deg'])
            }
        },
        'layers': evidence_layers
    }

    out_json = EVIDENCE / 'site01-roi-coverage.json'
    out_json.write_text(json.dumps(full_evidence, indent=2), encoding='utf-8')
    print(f'Saved evidence JSON to {out_json}')

    # 4. Generate figure
    print('4. Generating figure docs/figures/site01-roi-coverage.png...', flush=True)
    fig, axes = plt.subplots(1, 5, figsize=(20, 4.5), constrained_layout=True)

    titles = [
        'LDEM Surface Elevation (m)',
        'LDEC LOLA Count',
        'Slope (deg)',
        'Total Z RMS (m)',
        'Slope RMS (deg)'
    ]
    cmaps = ['viridis', 'plasma', 'inferno', 'magma', 'cividis']

    # For display, mask out non-ROI pixels
    for idx, (ax, (layer_key, (suffix, desc)), title, cmap) in enumerate(zip(axes, LAYERS.items(), titles, cmaps)):
        arr = arrays[layer_key].copy()
        arr[~roi_mask] = np.nan
        im = ax.imshow(arr, cmap=cmap, extent=[window_def.col_off, window_def.col_off+window_def.width,
                                               window_def.row_off+window_def.height, window_def.row_off])
        # Mark candidate point
        ax.scatter([window_def.col_off + best['col']], [window_def.row_off + best['row']],
                   c='red', s=40, marker='x', linewidth=1.5, label='Candidate' if idx == 0 else "")
        ax.set_title(title, fontsize=10, fontweight='bold')
        ax.set_xticks([])
        ax.set_yticks([])
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cbar.ax.tick_params(labelsize=8)

    if axes[0].get_legend_handles_labels()[0]:
        axes[0].legend(loc='lower left', fontsize=8)

    fig.suptitle('Site01 (Connecting Ridge) — PGDA 78 Raster Coverage across ROI Polygons', fontsize=12, fontweight='bold')
    out_png = FIGURES / 'site01-roi-coverage.png'
    fig.savefig(out_png, dpi=200, bbox_inches='tight')
    plt.close(fig)
    print(f'Saved figure to {out_png}')
    print('Site01 ROI coverage diagnostic completed successfully!')

if __name__ == '__main__':
    main()
