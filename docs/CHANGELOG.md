# Changelog

## 0.7.1 — 2026-11-28 (Body weight tracker)
Weight tracking expanded in place (same storage, same smoothing); nutrition and food logging are not part of this release.
- **Quick morning log** (Today card, optional via Customise Today; also on the Weight page): prefilled with the last day's weight, ± 0.1 kg steppers or typing, today by default, yesterday or any earlier day in one tap, optional note, one-tap save. Shows whether today is logged; saving the same day again corrects it instead of duplicating, and a value that matches a scale reading already synced from Google designates that reading.
- **Weight dashboard (`/weight`, from Today, Health and Body):** trend weight (estimate) and latest weigh-in, 7-day average, previous week, week-over-week change in kg and %, 30-day trend change, starting weight and total change, lowest / highest in the range, goal progress, weigh-in consistency and streak. Ranges 7D, 30D, 90D, 6M, 1Y, All. Chart with measured daily weights (dots) and the trend (line) as clearly different marks, goal line and phase starts; tap, drag or use the arrow keys to inspect a day's weigh-ins and notes.
- **Phases:** cutting, maintaining or bulking with name, start date, starting weight, optional end date, goal and target weekly rate. Current phase shows total change, observed weekly rate (least-squares over the phase) vs your target, goal progress and a projection only when moving toward the goal. Past phases stay listed. Nothing is prescribed.
- **History (`/weight/history`):** every weigh-in by day, Manual vs Google badges, notes; edit or delete manual entries; choose which weigh-in is the day's weight (Google entries are kept). **Calendar:** new Weight view.
- **Calculation change `weight-trend@2`:** the daily weight is one weigh-in (designated, else the first between 03:00 and 12:00, else the first of the day) instead of the mean of all weigh-ins, so evening readings no longer distort single days. Identical to @1 when there is one weigh-in per day (regression test). Weekly comparisons use equal adjacent 7-day periods with ≥ 3 weigh-ins each. See [CALCULATIONS § WEIGHT](CALCULATIONS.md).
- **Data:** migration `0004_weight_tracking` adds two tables (`weight_day_choice`, `weight_phases`); notes live in the manual entry's `attrs`. Included in backup/restore, export and delete-all (integration-tested). The Body page is now "Body & energy" and links to the Weight dashboard; its old weigh-in list moved to History.
- **Fix:** bottom sheets are rendered at page level, so a sheet opened from inside a glass card is no longer positioned and clipped by that card.
- **Tests:** 22 new unit and integration tests (including the upgrade from a 0.7.0 database); E2E + axe for logging, the dashboard, phase editing, history editing and the weight calendar.

## 0.7.0 — 2026-11-28 (Advanced health insights)
New views that extend Health and Training; existing pages, data and security controls are unchanged. All new calculations are pure functions in `src/lib/metrics` (portable to the iOS app) and documented in [CALCULATIONS](CALCULATIONS.md).
- **Health monitor (`/monitor`, from Health):** resting HR, HRV, sleeping HR, breathing rate, blood oxygen, skin temperature and six more measurements. For each one: latest value, personal normal range (28 days before, mean ± 1 SD; HRV on a log scale), deviation in units and SD, a 90-day trend with the range band, data completeness, calibration status, source and methodology. Descriptive only: no diagnoses, risk scores or red/green judgements (`personal-range@1`).
- **Health calendar (`/calendar`, from Health and Today):** month grid shaded by recovery, sleep score, load or steps, with workout and journal markers. Missing days are hollow, real zeros are filled. Tap a day for its summary (recovery, readiness, sleep, load, steps, workouts with categories, rest day, plan status, goals met, journal) and links to the full day and its timeline (`calendar@1`).
- **Daily timeline (`/timeline`, from Today, Health and the calendar):** heart rate, %HRmax zones, sleep stages, workouts, Google intensity and steps on one synchronised 24-hour axis. Correct on 23 h and 25 h DST days. Drag, use the arrow keys or jump to last night or a workout to inspect any interval. Raw samples stay in the database; the page gets one-minute summaries and never draws across gaps (`timeline@1`).
- **Training planner (`/training/plan`, from Training):** weekly split with your own day names and categories, rest days, per-day adjustments, planned vs completed for this week and next, 12 weeks of adherence, consistent weeks, and comparisons between similar workouts. Uses Google sessions and your workout labels; no Hevy Pro and no recommendations (`training-plan@1`). Stored in settings; no database migration.
- **Metric pages:** the HRV and deep-sleep HRV range bands now use the same log-scale range as the monitor.
- **Tests:** 24 new unit tests (ranges, DST ticks, bucketing without interpolation, interval allocation, plan matching and history, calendar grid); E2E + axe for the four new pages on iPhone (dark/light) and desktop, including timeline selection and a plan adjustment.

## 0.6.0 — 2026-11-27 (Advanced analytics and personalisation · first release on `main`)
### Security audit and release hardening
Full audit before the first release: [RELEASE_AUDIT](RELEASE_AUDIT.md). No credential or health data was found in the Git history, tags, Actions logs or artifacts.
- **Sessions can be revoked.** Logout revokes the session server-side, so a copied cookie stops working at once. Changing the app password ends every session. New cookie format (`s2.…`): **everyone signs in once after upgrading.**
- **The login brake survives restarts** (`auth-state.json` in the runtime folder) and also covers the delete-all password check. Login and logout reject cross-origin requests.
- **The tailnet gate fails closed.** Funnel is refused first. A request that shows any sign of a proxy needs a Tailscale identity even with a forged `Host: localhost`. Before, a loopback Host skipped the Funnel and allowlist checks (the password was still required).
- **Path safety resolves symlinks and Windows junctions**, so a junction into OneDrive or the repo is refused.
- **Secrets in repo-local `.env*` files stop the app from starting** (was a warning). All files Next.js loads are checked.
- **Content-Security-Policy** and `Cross-Origin-Opener-Policy` headers.
- **Correctness:** `civilDayBounds` returned a start in the previous day for zones whose DST starts at midnight (e.g. America/Santiago). Europe/Brussels was not affected; no formula changed.
- **Tests can no longer reach real data:** Vitest always runs with a throwaway `BASELINE_HOME` and `DATABASE_PATH`.
- **CI** (`.github/workflows/ci.yml`): gitleaks over the full history, a tracked-file check for databases and credentials, typecheck, tests, build, E2E + axe on fictional data, production `npm audit`. Actions pinned to commit SHAs, read-only token, no secrets, no artifacts.
- **Privacy:** machine-specific Tailscale hostname, a local group name and a real sample count removed from the docs. `.gitignore` covers credentials, keys, databases, exports, backups, logs, temp files and mobile signing files.
- Version 0.6.0 in `package.json` and the lockfile (the lockfile still had the old name and 0.1.0).
- Windows/CI install: `npm ci --ignore-scripts && npm rebuild esbuild` (no C++ build tools needed, see TESTING).

### Milestone C: weight, energy, reports (R5, R2, R7 infrastructure)
- **Weight & energy (`/body`, from Health → Body):**
  - manual weigh-ins (duplicate-safe; manual entries can be deleted, Google entries cannot) alongside Google records
  - smoothed trend (10 %/day, time-aware), 7- and 30-day change only with enough entries
  - weight goal with a projection only when justified
  - 90-day energy expenditure (estimates)
  - energy balance shown only with ≥ 7 days of intake + expenditure (no intake source yet)
- **Reports (`/reports`, from Trends):**
  - weekly and monthly; complete days only; per-day averages vs the previous period and your 28-day normal
  - workouts, sleep debt / SRI at period end, goal completion, day-by-day charts
  - no generated text
- **Associations (Journal):**
  - yes/no habits: Welch difference with 95 % CI, ≥ 8 days per group
  - amounts and scales: Spearman ρ with 95 % CI, ≥ 20 days
  - next-morning outcomes; chance-finding count stated; association ≠ cause
- `npm run check:analytics` covers goals, body, reports and associations.

### Milestone B: personalisation (R6, R8, R9)
- **Goals (`/goals`):**
  - daily: steps, active minutes, sleep, in bed by, wake-up
  - weekly: Active Zone Minutes, Zone 2, cardio sessions
  - progress rings, a 28-day / 8-week history (shape-coded: met, missed, in progress, no data) and completion rates
  - no data is never counted as missed
- **Journal (`/journal`):**
  - quick daily entry for yes/no, amount and 1–5 habits, with optimistic saving and clearing (not logged ≠ no)
  - eight suggested habits; add, rename, reorder, archive (keeps history), restore, delete
  - 4-week history grid
- **Customisable Today:**
  - reorder (drag handle or arrows), show/hide cards, pick up to 8 favourite metrics, reset
  - new Goals, Favourites and Journal cards; the layout is saved in the database
- Settings links to Goals and Journal. Exports include workout labels, habits and journal entries.
- Fixed before release: resetting the layout failed (null in settings), caught by E2E.

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
