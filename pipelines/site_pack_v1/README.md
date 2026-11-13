# Six-site reference pipeline

This directory contains the Python source used for the separately prepared LunarSight Data Pack v1. The code retains its original relative layout. Generated `data/` and `metadata/` folders are ignored by Git.

## Safe bootstrap check

From the repository root:

```bash
python3 pipelines/site_pack_v1/scripts/prepare_catalog.py --inputs-only
```

This standard-library-only command writes the six-site input catalog and proposal presets. It makes no network requests. The proposed demo display values are retained in a separately marked unverified snapshot; they must never be used as scientific fallbacks.

## Processing environment

Use Python 3.12. From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r pipelines/site_pack_v1/requirements.txt
```

## Reference components

| Script | Purpose |
| --- | --- |
| `prepare_catalog.py` | Proposal inputs, nomenclature audit, and small map/context assets. |
| `prepare_terrain.py` | Real source downloads, crops, slopes, terrain horizons, and terrain checks. |
| `prepare_environment.py` | Selected Diviner and Lunar Prospector extracts. |
| `prepare_ephemeris.py` | SPICE geometry, kernels, and Horizons reference comparisons. |
| `prepare_scenarios.py` | Hourly scenario comparisons and timeline caches. |
| `prepare_hazard_masks.py` | Threshold masks at the terrain grid's stated scale. |
| `build_pack_index.py` | Pack dossiers, layer index, and application bootstrap metadata. |
| `prepare_preview.py` | Scientific terrain preview from prepared rasters. |
| `validate_pack.py` | Checks a populated pack and retained component reports. |
| `package_release.py` | Packages an already validated populated pack. |

Terrain and environment commands accept cache/output options. Inspect `--help` for these components before selecting storage paths. The complete workflow downloads several GB for the six-site extracts; it does not implement the planned full-hemisphere acquisition.

## Using the existing complete pack

The complete ZIP has its original scripts, metadata, validation reports, kernels, and data in one directory. Extract it separately, install its requirements, and use its README and `scripts/validate_pack.py` from that extracted directory. The repository release descriptor records the original ZIP's size and SHA-256.

The reference scripts in this repo are useful for inspection and continued development. A fresh clone does not include all assets or component reports expected by `validate_pack.py`. A fully automated clean-room rebuild, including generation of every validation report, remains a task in the acquisition roadmap. Do not report a fresh-clone full rebuild as tested based only on the bootstrap check.

Read the [terrain](../../docs/methods/terrain.md), [environment](../../docs/methods/environment.md), and [ephemeris](../../docs/methods/ephemeris.md) notes before interpreting results. File paths in those original method notes are relative to the complete extracted pack.
