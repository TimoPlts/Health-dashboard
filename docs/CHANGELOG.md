# Changelog

## 0.6.0 — unreleased (Advanced analytics and personalisation)
### Milestone A: sleep, training, cardio (R1, R3, R4)
- **Workouts:**
  - your own name, category (push / pull / legs / upper / full body / cardio / rest) and effort 1–10
  - category filter on Training
  - comparison with similar workouts, including the average of similar sessions
  - provider data untouched; exclusions unchanged
- **Sleep:**
  - recommended bedtime from sleep need, wake-up target (new setting) and usual efficiency
  - wake after sleep onset, wakings and short awakenings
  - overnight heart-rate, HRV and SpO₂ graphs
  - naps
  - comparison with the previous night and the 14-night average
  - 30-night sleep-debt history
  - a "How sleep is calculated" sheet
- **Cardio page (`/cardio`, from Training):**
  - weekly Zone 2, Active Zone Minutes (by Google zone), cardio sessions and time, load and resting heart rate
  - rings against your goals, with the WHO guideline as a reference
  - 12-week charts and comparisons that use complete weeks only
  - %HRmax vs physiological Zone 2 explained; load ratio shown with its limitations
- **Pure, platform-independent modules:** `lib/metrics/periods.ts`, `sleep-detail.ts`, `workout-labels.ts`.
- `HrChart` now also draws overnight HRV and SpO₂. `Sheet` can close itself and has an accessible trigger label.

## 0.5.0 — 2026-11-26 (Production readiness)
### Roadmap
- `docs/ROADMAP.md`: prioritised features R1–R12 (labels, reports, Zone 2, sleep depth, goals, journal, correlations, …).
### Calculation audit ([FEATURE_AUDIT](FEATURE_AUDIT.md))
- `acwr-ewma@2`: ACWR and training balance use only complete days with ≥ 10 h heart-rate coverage. Today's partial load no longer pulls the ratio down each morning.
- `recovery@2`: HRV is required. RHR + sleep alone no longer produce a "recovery" score.
- `sleep-sri@2`: noon-to-noon windows. Unrecorded following nights no longer lower SRI.
- Daily totals: today is shown as "so far" and excluded from averages, comparisons and baselines.
- Readiness: method choice documented (Kiviniemi; HRV above the band is not flagged). Code simplified.
- Docs: zone systems, Zone 2 definition, load ring, EWMA seeding, energy error range, HR recovery, dormant strength metrics.
### Deployment (iPhone via Tailscale, autostart)
- Production server under a supervisor (`scripts/server.mjs`):
  - restart on crash with backoff, health checks
  - graceful stop that waits for a running sync
  - logs in `BASELINE_HOME\logs` (14 days, size cap)
- Windows Task Scheduler task "Baseline" (`npm run service -- install | deploy | status | logs …`): starts hidden at sign-in, or at boot with admin rights.
- Tailnet-only HTTPS via Tailscale Serve (`npm run configure -- tailscale`). A tailnet identity gate refuses Funnel traffic, and an optional login allowlist restricts access to the owner.
- Secure cookies over HTTPS, sliding 30-day sessions, `no-store` on all personal responses, HSTS.
- `/api/health` (no data), loading state, PWA manifest id/scope/maskable icon, Server block in Settings.
- `npm run dev` moved to port 3001 so it can run next to the production service.
### Data protection
- Settings → Your data:
  - back up now; daily automatic backups (keep 7/14/30)
  - raw-response retention
  - full CSV export; daily-summary download
  - delete everything (password + DELETE; revokes Google; secure_delete + VACUUM; removes backups, exports and logs)
- `npm run data -- backup | list | verify | restore | export | retention | delete-all`. Restore verifies, stops the service, keeps a safety copy and restarts. Verified on real data.
- Retention after each sync: raw API responses 90 days (default), sync history 90 days, exports 7 days. Measurements are never pruned.
- `disconnectProvider` shared by Settings and delete-all.
### Added
- 9 metric pages for Google data that was stored but not shown:
  - breathing rate in deep, light and REM sleep
  - SpO₂ low end
  - light, moderate and vigorous activity minutes
  - AZM by zone
- `docs/FEATURE_AUDIT.md`: comparison with Google Health, Bevel, WHOOP, Athlytic and Apple Fitness, and the calculation audit.

## 0.4.1 — 2026-11-26 (Sync fixes)
### Fixed
- Sync state no longer forgets the backfill. Every later sync used to re-fetch the full year (8–15 min); an incremental sync now takes under a minute with about one page per stream.
- The sync high-water mark (`syncedThrough`) never moves backwards while old chunks are re-fetched.
- A lock file left by a stopped server is released immediately when its process is gone, instead of blocking syncs for 45 minutes.
- Runs cut off by a server stop are recorded as `interrupted`, not left as `running`.

## 0.4.0 — 2026-11-26 (Analytics, redesign, workouts, automatic sync)
### Added
- Analytics engine:
  - recovery index, training readiness and fatigue flags against 28-day personal baselines, with explicit calibration
  - sleep score, need, debt, Sleep Regularity Index and midpoint variability
  - Edwards TRIMP and %HRmax zones from all-day heart rate (HRmax 220 − age, matching Google's zone model, verified)
  - ACWR and training balance
  - `derived_daily` cache and a metric registry (59 measurements)
- Pages:
  - Today: recovery / sleep / load rings, readiness, flags, last night, vitals vs baseline, activity, workouts
  - Sleep: score breakdown, stages, need/debt, consistency, bed & wake chart, sleep vitals
  - Health: every measurement
  - Metric detail: ranges, scrubbable chart, baseline band, averages, min/max, previous-period comparison, source and method sheet, data table
  - Trends; Training; workout detail; Settings
- Workouts from Google exercise sessions + Fitbit HR, no Hevy Pro needed:
  - grouping of Fitbit and Hevy-via-Apple-Health duplicates
  - zones, load, HR recovery, comparisons
  - exclusions that leave provider data untouched
- Automatic sync scheduler:
  - runs while the server is up, every 30 min by default (configurable)
  - backoff after failures; cross-process lock
  - status pill and per-stream status
- Settings: sleep need, HRmax override, sync interval. Google profile age is stored on sync.
- Liquid-Glass design system v2:
  - domain tokens for dark and light
  - floating glass tab bar, view transitions, bottom sheets
  - desktop two-column layout
- `npm run check:analytics`: coverage, status and timings on real data, never values.
- Demo seed covers all streams over 60 days.
### Changed
- Hevy is optional and nothing depends on it. Its workout page moved to `/training/hevy/[id]`.
- E2E covers every page in dark, light and desktop, with axe checks.


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
