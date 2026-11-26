# Baseline: project overview

_Last updated: 2026-11-26 · describes commit `23a3d29` on branch `phase-0-foundation`_

## What it is
Baseline is a private, single-user health and training app for one Fitbit Air wearer.
- It reads all data from the **Google Health API** and stores it in a local SQLite database.
- It shows the data in a mobile-first web app: Today, Sleep, Training, Trends, Health, metric detail and Settings.
- On top of Google's measurements, it computes documented, versioned metrics: recovery, readiness, sleep score/debt/regularity, heart-rate load, zones and ACWR.
- It has no AI features, no cloud hosting and no paid dependencies. Runtime data stays in `%LOCALAPPDATA%\Baseline`, outside OneDrive and Git.

## What works
Verification levels: **verified on real data** › **tested** (unit/integration/E2E on fictional data) › **unverified**.

| Area | Level | Evidence / notes |
|---|---|---|
| Google OAuth (Personal mode) | verified on real data | connected; token refresh works |
| 35 Google data streams | verified on real data | `npm run probe:google`, `verify:google`. Details in [METRIC_INVENTORY](METRIC_INVENTORY.md) and [API_RESEARCH §1.10](API_RESEARCH.md) |
| No double counting of steps/distance/energy | verified on real data | reconciled daily sums equal Google's `dailyRollUp` ([ADR-0004](adr/0004-reconcile-vs-list.md)) |
| 365-day backfill + incremental sync | verified on real data | an incremental run takes about 1 min; re-sync is idempotent |
| Automatic sync (in-process, every 30 min) | verified on real data | lock file prevents overlap; interrupted runs are recorded |
| Derived metrics (TRIMP, %HRmax zones, worn time) | verified on real data (structure, HRmax model) | HRmax = 220 − age matches Google's zone bounds ([CALCULATIONS](CALCULATIONS.md)) |
| Workouts from Google exercise sessions + HR | verified on real data (structure) | Fitbit and Hevy-via-Apple-Health duplicates merge correctly |
| Recovery, readiness, ACWR | tested; run on real data but **calibrating** | need 14 nights (≈ 2026-12-08) and 21 tracked days (≈ 2026-12-15) |
| Sleep score, debt, regularity | tested; run on real data | regularity needs 5 nights |
| All page read models on real data | verified (no errors, 4–25 ms) | `npm run check:analytics` prints coverage and timings, never values |
| UI (all pages, dark/light, phone/desktop) | tested on the fictional demo DB | Playwright + axe ([TESTING](TESTING.md)) |
| Displayed values vs. the Google Health app | **unverified by the owner** | values match the API exactly; the owner has not yet compared them with the app |

Test suite at `23a3d29`: 163 unit/integration tests pass, typecheck clean; 12 E2E passed at `d1b9c06` (no UI change since).

## Problems and constraints
- **Short history.** The Air was first worn on 2026-11-24, so baseline-dependent scores show "Calibrating n/14". No score is guessed.
- **Workouts have no exercise detail.** Hevy's entries reach Google via Apple Health with type, time and calories only. Sets, reps and weights are never fabricated.
- **Empty streams for this account:** basal energy, altitude, VO₂ max, body fat, blood glucose and core temperature. They are synced and will appear if a source writes them.
- **Swim-length intervals** detected by the Air are unconfirmed (they may be false detections).
- Google occasionally times out on large 90-day requests. The stream is retried on the next run.
- Heart-rate load under-represents strength training (true of any HR-based method).
- The app runs only while the PC's dev server is up; always-on hosting is undecided.
- **The repo is public:** no credentials, real values, probe output or databases are ever committed ([SECURITY](SECURITY.md)).
- `.next/` and `node_modules/` still sync to OneDrive (build artefacts only).

## Key decisions
- PWA + local Node server, not native ([ADR-0001](adr/0001-pwa-plus-server.md)). SQLite ([ADR-0002](adr/0002-sqlite.md)). Polling sync with lookback windows ([ADR-0003](adr/0003-polling-sync.md)).
- `reconcile` for activity, `list` for vitals ([ADR-0004](adr/0004-reconcile-vs-list.md)).
- Hevy is out of scope. Workouts come from Google exercise sessions ([ADR-0005](adr/0005-workouts-from-google.md)).
- Missing data is `null`/"—", never 0. Estimates are labelled. Scores show calibration progress instead of guessing.
- Prefer Google's own measurements and published methods. Baseline's scores are its own and are not presented as WHOOP or Bevel equivalents ([CALCULATIONS](CALCULATIONS.md)).
- Design is reviewed only on fictional demo data, never on real readings.

## Next three actions
1. **Owner:** compare three days in Baseline with the Google Health app (`npm run verify:google -- 3 --show-values`, local terminal only).
2. **Owner:** confirm whether the Air's swim-length detections are real. If not, decide whether to exclude them.
3. **From 2026-12-08:** review recovery and readiness against how you feel; then merge `phase-0-foundation` into `main`.

## Commands
`npm run dev` · `npm run sync [-- --days N]` · `npm run probe:google` · `npm run verify:google [-- N] [--show-values]` · `npm run check:analytics` · `npm run configure` · `npm test` · `npm run lint` · `npm run test:e2e` (needs `npm run db:seed-demo`; stop the dev server first) · `npm run backup`

## Documentation
[README](../README.md) (run, commands) · [Architecture](ARCHITECTURE.md) · [API research](API_RESEARCH.md) · [Metric inventory](METRIC_INVENTORY.md) · [Calculations](CALCULATIONS.md) · [Data model](DATA_MODEL.md) · [Design system](DESIGN_SYSTEM.md) · [Security](SECURITY.md) · [Testing](TESTING.md) · [Google setup](SETUP_GOOGLE.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [ADRs](adr/)
