# Changelog

## 0.3.0 — 2026-11-26 (Phase 1: Google data foundation verified)
### Fixed
- Google filters used camelCase type names (`heartRate.sample_time…`) → HTTP 400 for 20 of 24 streams. Filters now use snake_case; paths stay kebab-case.
- Exercise filter: the API only accepts `exercise.interval.civil_start_time`; window replacement now matches the same civil dates (no deletion of sessions just across midnight).
- Today's total energy was always "—" (basal energy is never provided for the Air); it now uses Google's `total-calories` daily rollup.
- Workout detail preferred any overlapping Google session; it now prefers the Fitbit-recorded one over Hevy's Apple Health copy.
### Added
- Streams: activity-level, floors, altitude, swim-lengths-data, height, run-vo2-max, blood-glucose, core-body-temperature (35 streams total).
- `dailyRollUp` client + streams: total-calories, calories-in-heart-rate-zone, heart-rate daily min/avg/max.
- HRV LF/HF power, respiratory-rate SD, blood-glucose and core-temperature attributes.
- `npm run probe:google` rewritten: OK_DATA / OK_EMPTY / ERROR per stream, all pages, HR resolution, double-count check, `--history`.
- `npm run verify:google`: DB vs Google daily aggregates, duplicates, overlaps, sleep integrity, timestamps (values only with `--show-values`).
- `npm run sync -- --days N`; a later larger backfill extends history backwards automatically.
- Regression tests for every stream's method/filter/normalizer (138 tests).
### Verified against real data
- All 35 streams return valid responses. HR is sampled every 3 s; stored daily HR min/avg/max equals Google's exactly. Σ reconciled steps/distance/energy per day equals Google's daily totals exactly; raw multi-source lists would double count (up to +100 %). Re-sync is idempotent.


## 0.2.0 — 2026-11-26 (Phase 1 prep)
### Changed
- Renamed to **Baseline** (package, metadata, manifest, icons, login wordmark, docs).
- All sensitive runtime data moved to `%LOCALAPPDATA%\Baseline` (config, DB, backups, exports, probe output); enforced by `assertSafeLocation`. `.env.local` is no longer used.
- Dev/prod servers bind to 127.0.0.1. Next request logging and browser-log forwarding disabled.
### Added
- `npm run configure` (hidden prompts, Google client JSON import + deletion, Windows ACL lock-down), `npm run backup`.
- Runtime-home unit tests. E2E isolated from the real config.
- Google setup guide revalidated: restricted scopes, Personal mode (plan A) vs Testing (plan B).
### Removed
- `npm run setup` and `hash-password` (they took the password as a CLI argument).


## 0.1.0 — 2026-11-26
### Added
- Research: Google Health API v4 (legacy Fitbit Web API shut down 2 Nov 2026), Hevy OpenAPI, Fitbit Air BLE HR, iOS options. Metric inventory & availability matrix.
- Next.js 16 + TypeScript + Tailwind 4 + SQLite (Drizzle) foundation.
- Google OAuth (PKCE, encrypted tokens, refresh, re-auth detection), Google Health client, 24 sync streams, normalizers.
- Hevy client, template + workout backfill, events-based incremental sync with soft deletes.
- Raw response storage, idempotent upserts, per-stream sync state, run log, retry/backoff/throttle.
- Calculations: HR window stats, HRR/provider zones, HR recovery, Banister TRIMP, EWMA load, Epley/Brzycki e1RM, volume load, muscle sets, sleep efficiency, rolling baselines.
- UI: glass design system, floating tab bar, Today, Training, Workout detail (HR timeline/zones/recovery/sets), Settings, Login; PWA manifest & icons.
- Single-user password auth, proxy route protection, CSRF origin check, security headers.
- Probe scripts for real-data structure verification; demo seeder (fictional, separate DB).
- 56 unit/integration tests, 9 Playwright E2E tests (iPhone dark/light, desktop) with axe checks.
