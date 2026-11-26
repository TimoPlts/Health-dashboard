# Project status

_Last updated: 2026-11-26 — Phase 1 (real-data integration) in progress._

## Verification levels
**Implemented** → **tested with fictional data** → **tested against real provider data** → **verified end-to-end**.

| Area | Level | Notes |
|---|---|---|
| Branding: Baseline (name, metadata, manifest, icons, login, docs) | done | light-touch; visual overhaul after real data |
| Runtime data outside OneDrive (`%LOCALAPPDATA%\Baseline`) | **verified on this PC** | DB created there; guard refuses OneDrive/repo paths (unit-tested); ACL = user + SYSTEM only (checked with icacls) |
| Secret entry (`npm run configure`, hidden prompts / JSON import) | implemented, init path verified | interactive prompts are exercised by the owner |
| Local server | **running**, bound to 127.0.0.1 | Tailscale/LAN not reachable (verified) |
| Dev logging hardened | verified | request URLs (OAuth codes) no longer logged to `.next/dev/logs` |
| Google OAuth | tested (mocked) | real consent pending (Plan A Personal mode / Plan B Testing) |
| Google Health client + 24 streams | tested (mocked) | filter syntax & fields unconfirmed until probe |
| Hevy client + events sync | tested (mocked) | |
| Workout ↔ HR matching, calculations | tested (fictional) | |
| UI | E2E + axe on demo data | |
| Real Fitbit Air data | **pending owner steps** | SETUP_GOOGLE.md 1–9 |
| Real Hevy data | **pending owner step** | SETUP_GOOGLE.md 10 |
| Fitbit HR inside Hevy | unverified | manual test; no code involved |

## Known limitations / open questions
- Restricted `googlehealth.*` scopes: does Personal mode accept them? (test). Otherwise 7-day reconnect.
- Fitbit Air HR sampling interval, history depth and which types are populated: unknown until probe.
- Fitbit Sleep Score / Daily Readiness are not in the API. Hevy has no HR fields or webhooks.
- `.next/` and `node_modules/` still sync to OneDrive (artefacts only).
- Sync is manual/CLI; no scheduler yet. Step goal hard-coded.

## Commands
`npm run configure [-- status|password|google]` · `npm run dev` · `npm test` · `npm run lint` · `npm run test:e2e` · `npm run sync` · `npm run probe:google` · `npm run probe:hevy` · `npm run backup`

## Branches
- `main`: initial commit only. `phase-0-foundation`: all work so far (pushed, not merged until real data is verified).

## Next steps
1. Owner: SETUP_GOOGLE.md steps one by one (the assistant guides).
2. Run probes → fix filter/field mismatches → small sync (2 days) → verify → full backfill.
3. Hevy import → match real workouts with HR → verify avg/max/zones → update METRIC_INVENTORY with observed results.
