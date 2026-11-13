#!/usr/bin/env python3
"""Seal the prepared pack with an inventory, SHA-256 list, and ZIP archive."""
from pathlib import Path
import hashlib,json,datetime,shutil,zipfile

ROOT=Path(__file__).resolve().parents[1]

def eligible(path):
    return path.is_file() and not any(x in {'.venv','.git','__pycache__'} for x in path.parts) and path.suffix not in {'.pyc','.part'}

def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    qa=json.loads((ROOT/'metadata/pack_validation.json').read_text())
    if qa['status']!='passed':raise RuntimeError('Validate pack before packaging')
    excluded={'dataset_manifest.json','checksums.sha256'}
    payload=[p for p in sorted(ROOT.rglob('*')) if eligible(p) and p.name not in excluded]
    rows=[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)} for p in payload]
    manifest={'title':'LunarSight Data Pack v1','version':'1.0.0','prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'proposal':'LunarSight V2 Product Proposal,2026-11-05; exact six proposal coordinates retained',
        'entrypoint':'data/app_bootstrap.json','readme':'README.md','units_contract':'docs/integration_contract.md',
        'component_provenance':['metadata/catalog/source_manifest.json','metadata/terrain/sources.json','metadata/terrain/artifacts.json','metadata/environment/environment_manifest_fragment.json','metadata/ephemeris/ephemeris_manifest.json','metadata/scenarios/method.json'],
        'validation':'metadata/pack_validation.json','counts':qa['counts'],
        'payload_file_count':len(rows),'payload_bytes':sum(r['bytes'] for r in rows),
        'inventory_excludes':['dataset_manifest.json','checksums.sha256'],
        'missing_science':['local water-ice wt%','annual surface minimum temperature','polar thermal and PSR products at SHIV','full custom-coordinate/sensitivity grid','radio link and power budgets','rover route solution'],
        'source_originals_policy':'Compact source originals and metadata are included; large raster/seasonal originals were downloaded for processing but are external caches, reproducible with delivered scripts and URLs.',
        'files':rows}
    (ROOT/'dataset_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    checksum_files=[p for p in sorted(ROOT.rglob('*')) if eligible(p) and p.name!='checksums.sha256']
    (ROOT/'checksums.sha256').write_text(''.join(f'{digest(p)}  {p.relative_to(ROOT).as_posix()}\n' for p in checksum_files),encoding='utf-8')
    archive=ROOT.parent/'LunarSight_Data_Pack_v1.zip'
    allfiles=[p for p in sorted(ROOT.rglob('*')) if eligible(p)]
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for p in allfiles:z.write(p,(Path(ROOT.name)/p.relative_to(ROOT)).as_posix())
    with zipfile.ZipFile(archive) as z:
        bad=z.testzip()
        if bad:raise RuntimeError(f'ZIP CRC error: {bad}')
        assert len(z.infolist())==len(allfiles)
    guide=ROOT.parent/'LunarSight_Data_Readiness.md';summary=ROOT.parent/'LunarSight_Site_Summary.csv'
    shutil.copyfile(ROOT/'README.md',guide);shutil.copyfile(ROOT/'data/catalog/site_summary.csv',summary)
    report={'zip_path':str(archive),'zip_bytes':archive.stat().st_size,'zip_sha256':digest(archive),'archive_file_count':len(allfiles),
        'uncompressed_bytes':sum(p.stat().st_size for p in allfiles),'crc_validation':'passed',
        'guide':str(guide),'site_summary':str(summary)}
    (ROOT.parent/'lunarsight_release_receipt.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
