# ADR-0003: Polling sync with lookback windows (no webhooks yet)

**Status:** accepted · 2026-11-26

Google Health webhooks need a public HTTPS endpoint, a service account, and are best-effort. The Fitbit Air uploads only when the phone app syncs, so data arrives late anyway. We poll each stream from `syncedThrough − lookbackDays` (2–14 days by type) with idempotent upserts, and session types replace their window to propagate deletions. Hevy uses its `/v1/workouts/events` feed. Revisit webhooks once hosted.
