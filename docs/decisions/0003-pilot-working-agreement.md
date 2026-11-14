# ADR 0003 — Pilot working agreement

- Status: Accepted as a revisable working configuration, 14 November 2026.
- Authority: user reported team agreement in conversation.
- Config: [pilot-v1](../../config/pilot-v1.json); [sample evidence](../../notebooks/evidence/pilot-v1-samples.json).

Use Site01 and Site04 Data Book reference points to prepare a local 2.5 km square preview and compare a provisional UTC mission interval of 1 January–1 February 2027, hourly, with 1 m observer height above ground. These reference points are outside inspected PGDA ROI polygons and are not selected landing coordinates. The preview box is not the PGDA ROI and is not a horizon footprint.

A 25 km radius is a diagnostic starting point, not evidence of sufficient horizon coverage. No p95 tolerance, final resolution or full-data acquisition is approved; historical profiles require reproduction. Ellipsoid altitude is unknown until the terrain datum is reconciled with Horizons; do not put 1 m AGL directly into its ellipsoid-altitude field. Site identity, ROI, mission interval and cadence may be changed by the team; version the config and regenerate affected outputs.

The existing 500×500 5 m samples were checked against retained sample hashes and contained 250,000 finite pixels per site. This verifies only these cached preview windows, not the full ROI, remote source file checksum or regional horizon coverage.
