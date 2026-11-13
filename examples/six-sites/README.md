# Small six-site examples

These files are copied from the prepared LunarSight Data Pack v1. They are small enough for code review and initial UI/backend integration.

- `sites.json`: proposal coordinates and original display names; names are not all geographically verified.
- `mission_profiles.json`: application presets, not official mission requirements.
- `scenario_presets.json`: proposed dates, durations, mast settings, and sensitivity controls.
- `site_summary.csv`: source-based and derived summaries with explicit missing values.
- `site_name_audit.csv` and `coordinate_review.json`: the geographic-name audit.

Use `site_id` for joins. Review `../../docs/integration-contract.md` before interpreting fields. The full large-asset distribution is separate; none of these examples establishes uniform coverage of arbitrary coordinates.
