# ADR-0004: `reconcile` for activity intervals, `list` for vitals

**Status:** accepted · 2026-11-26 · **validated on real data 2026-11-26**: Σ reconcile per day equals `dailyRollUp` exactly; raw `list` over-counted by up to 100 % ([API_RESEARCH §1.10](../API_RESEARCH.md))

Steps/distance/energy can come from both the phone and the band. Summing `list` results would double-count. `reconcile` returns one merged stream and excludes off-wrist intervals, but drops `dataSource`. Heart rate and other vitals use `list` restricted to `google-wearables`, keeping device provenance. If several HR sources exist, analytics pick the source with most samples per window rather than merging.
