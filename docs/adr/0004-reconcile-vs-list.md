# ADR-0004: `reconcile` for activity intervals, `list` for vitals

**Status:** accepted · 2026-11-26 · **to be validated with real data**

Steps/distance/energy can come from both the phone and the band. Summing `list` results would double-count. `reconcile` returns one merged stream and excludes off-wrist intervals, but drops `dataSource`. Heart rate and other vitals use `list` restricted to `google-wearables`, keeping device provenance. If several HR sources exist, analytics pick the source with most samples per window rather than merging.
