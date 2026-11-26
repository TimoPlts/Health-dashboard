# Project status

_Last updated: 2026-11-26 — Phase 1: Google data foundation **verified against real data**; Hevy next._

## Verification levels
**Implemented** → **tested with fictional data** → **tested against real provider data** → **verified end-to-end**.

| Area | Level | Notes |
|---|---|---|
| Branding: Baseline (name, metadata, manifest, icons, login, docs) | done | light-touch; visual overhaul after real data |
| Runtime data outside OneDrive (`%LOCALAPPDATA%\Baseline`) | **verified on this PC** | DB created there; guard refuses OneDrive/repo paths (unit-tested); ACL = user + SYSTEM only (checked with icacls) |
| Secret entry (`npm run configure`, hidden prompts / JSON import) | implemented, init path verified | interactive prompts are exercised by the owner |
| Local server | **running**, bound to 127.0.0.1 | Tailscale/LAN not reachable (verified) |
| Dev logging hardened | verified | request URLs (OAuth codes) no longer logged to `.next/dev/logs` |
| Google OAuth | **verified end-to-end** | Personal mode accepted the restricted `googlehealth.*` scopes; identity call OK |
| Google Health client + 35 streams | **tested against real data** | all 35 return valid responses (27 with data, 8 valid-but-empty); filter syntax, fields, pagination and rollups confirmed. See METRIC_INVENTORY “Observed on the real account” |
| Hevy client + events sync | tested (mocked) | |
| Workout ↔ HR matching, calculations | tested (fictional) | |
| UI | E2E + axe on demo data | |
| Real Fitbit Air data | **imported, verified** | 365-day backfill done (Air data from 2026-11-24, iPhone steps from 2026-10-25). `npm run verify:google`: HR daily min/avg/max = Google exactly; Σ reconciled activity = Google daily totals; no duplicates/overlaps; sleep stages = summaries; re-sync idempotent |
| Real Hevy data | **pending owner step** | SETUP_GOOGLE.md 10 |
| Fitbit HR inside Hevy | unverified | manual test; no code involved |

## Known limitations / open questions
- History is short: the Air was first worn 2026-11-24; Google holds iPhone step/distance/energy history only from 2026-10-25.
- Empty for this account (valid responses, no data): basal energy, altitude, VO₂ max (daily/sample/run), body fat, blood glucose, core temperature. Synced anyway so they appear if a source starts writing them.
- Reconciled activity rows carry no device provenance (Google merges Air + iPhone); verified equal to Google's own daily totals.
- Every Hevy workout also appears in Google as an Apple Health exercise session (Hevy → Health → Google). Kept with provenance; Fitbit-recorded sessions are preferred for display.
- Swim-length intervals were detected by the Air (passively measured) — owner to confirm whether they correspond to real swims.
- `skin-temperature-sensors` is v4beta-only (empty); ECG/IRN need other scopes and hardware; nutrition/hydration need the nutrition scope (not requested).
- The full 365-day heart-rate backfill takes ~10 min (one request per day, 5 000-sample pages).
- Fitbit Sleep Score / Daily Readiness are not in the API. Hevy has no HR fields or webhooks.
- `.next/` and `node_modules/` still sync to OneDrive (artefacts only).
- Sync is manual/CLI; no scheduler yet. Step goal hard-coded.

## Commands
`npm run configure [-- status|password|google]` · `npm run dev` · `npm test` · `npm run lint` · `npm run test:e2e` · `npm run sync [-- --days N]` · `npm run probe:google [-- N --history]` · `npm run verify:google [-- N]` · `npm run probe:hevy` · `npm run backup`

## Branches
- `main`: initial commit only. `phase-0-foundation`: all work so far (pushed, not merged until real data is verified).

## Next steps
1. Owner: compare a few days with the Google Health app — `npm run verify:google -- 3 --show-values` (values stay in your terminal).
2. Hevy: enter the API key in Settings → `npm run probe:hevy` → import → match real workouts with Fitbit HR → verify avg/max/zones.
3. Only then: UI overhaul on top of the verified data.
