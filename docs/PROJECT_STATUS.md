# Project status

_Last updated: 2026-11-26. Phases 1–5 done: verified Google data, analytics engine, redesigned app, workouts without Hevy Pro, automatic sync._

## Verification levels
**Implemented** → **tested with fictional data** → **tested against real provider data** → **verified end-to-end**.

| Area | Level | Notes |
|---|---|---|
| Runtime data outside OneDrive (`%LOCALAPPDATA%\Baseline`) | verified on this PC | ACL = user + SYSTEM |
| Google OAuth (Personal mode, restricted scopes) | **verified end-to-end** | |
| Google Health client, 35 streams | **tested against real data** | `npm run probe:google` / `verify:google` |
| Real Fitbit Air data | **imported, verified** | 365-day backfill. Air data from 2026-11-24, iPhone steps from 2026-10-25 |
| Derived metrics (TRIMP, zones, worn time) | tested against real data | HRmax = 220 − age, matching Google's zones (verified by ratio check) |
| Recovery / readiness / baselines | tested (fictional + unit); runs on real data | **calibrating** on real data: needs 14 nights, from ~2026-12-08 |
| ACWR / training balance | tested (fictional + unit); runs on real data | calibrating: needs 21 tracked days, from ~2026-12-15 |
| Sleep score / debt / SRI | tested; runs on real data | SRI needs 5 nights |
| Workouts from Google sessions | **tested against real data** (structure) | 8 sessions → 6 workouts. Fitbit + Hevy (Apple Health) duplicates merged. One < 60 s session flagged |
| Every page read model on real data | verified (no errors; 4–25 ms) | `npm run check:analytics` (no values printed) |
| UI | E2E + axe on fictional demo data (iPhone dark/light, desktop) | design reviewed through demo-data screenshots only |
| Automatic sync | implemented | starts with the server, default every 30 min. Lock file prevents overlap with CLI/Task Scheduler |
| Hevy direct import | implemented, optional, **not used** (needs Hevy Pro) | nothing depends on it |
| Fitbit HR inside Hevy (BLE) | unverified | manual test; no code involved |

## Known limitations
- History is short: baselines and ratios show "Calibrating n/14" until enough nights exist. No score is guessed.
- Hevy's Apple Health entries carry only time, type and calories. Exercises, sets, reps and weights need Hevy Pro (API).
- Empty for this account: basal energy, altitude, VO₂ max, body fat, blood glucose, core temperature (synced; they appear if a source writes them).
- Reconciled activity rows have no device provenance; their per-day totals equal Google's exactly.
- Swim-length intervals detected by the Air: the owner should confirm whether they are real.
- Heart-rate load under-represents strength training (true of any HR method).
- `.next/` and `node_modules/` still sync to OneDrive (artefacts only).

## Commands
`npm run dev` · `npm run sync [-- --days N]` · `npm run probe:google [-- N --history]` · `npm run verify:google [-- N] [--show-values]` · `npm run check:analytics` · `npm run configure` · `npm test` · `npm run lint` · `npm run test:e2e` (needs `npm run db:seed-demo`; stop the dev server first) · `npm run backup`

## Branches
- `main`: initial commit only. `phase-0-foundation`: all work (pushed). Merge when the owner has used the app on real data.

## Next steps
1. Owner: use the app daily and compare a few days with Google Health (`npm run verify:google -- 3 --show-values`).
2. When calibration completes (~2026-12-08), review recovery and readiness against how you feel; tune nothing without documenting it.
3. Phase 6: export + delete-all, manual workout labels, optional Hevy Pro import.
