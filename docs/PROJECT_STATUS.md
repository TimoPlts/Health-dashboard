# Project status

_Last updated: 2026-11-26 — milestone “Phase 0 + foundation” (commit after this file)._

## Verification levels
**Implemented** → **tested with fictional data** → **tested against real provider data** → **verified end-to-end**.

| Area | Level | Notes |
|---|---|---|
| Research & docs | done | API_RESEARCH, METRIC_INVENTORY, CALCULATIONS, ARCHITECTURE… |
| Google OAuth (PKCE, refresh, re-auth detection) | tested (fictional/mocked) | real consent never run |
| Google Health client + 24 stream definitions | tested (mocked) | **filter syntax & field names not yet confirmed on real data** |
| Hevy client + events-based incremental sync | tested (mocked) | shapes from official OpenAPI |
| Raw storage, normalization, idempotent upserts, window replacement | tested (in-memory SQLite) | |
| Workout ↔ HR matching, zones, recovery, volume, e1RM | tested (fictional) | |
| Calculations library (HR stats, zones, TRIMP, EWMA, e1RM, volume, sleep efficiency, baselines) | tested (unit) | |
| App auth (password, session, proxy, CSRF origin check) | E2E tested | |
| UI: Today, Training, Workout detail, Settings, Login | E2E + screenshots (demo data), axe AA clean | |
| Production build | passes | |
| Real Fitbit Air data | **blocked** | needs your Google Cloud credentials |
| Real Hevy data | **blocked** | needs your Hevy Pro API key |
| Fitbit HR inside Hevy | **unverified** | manual test in SETUP_GOOGLE §7 |
| Scheduled sync, export, delete-all, settings UI, Sleep/Health/Trends tabs | not implemented | ROADMAP |

## Known limitations / open questions
- Actual Fitbit Air HR sampling interval: unknown (the probe measures it).
- Whether `googlehealth.*` scopes can be used “In production” unverified (7-day token expiry otherwise).
- Fitbit Sleep Score and Daily Readiness are **not available** via the API. Proprietary scores (WHOOP, Bevel, Garmin) cannot be reproduced exactly.
- Hevy has no HR/calorie fields and no webhooks. Hevy rate limits are undocumented.
- Sync runs only while the server runs (manual/CLI for now). No hosting decided yet.
- Repo is inside OneDrive: the DB would be uploaded unless `DATABASE_PATH` points outside it (SECURITY.md).
- Step goal is hard-coded (10 000) until the settings UI exists.

## Blockers
1. Google Cloud OAuth client + linked Google Health account (you).
2. Hevy Pro API key (you).
3. Hosting decision for always-on sync / iPhone access (you; options in ADR-0001).

## Commands
`npm run setup -- "<pw>"` · `npm run dev` · `npm test` · `npm run lint` · `npm run db:seed-demo` · `DEMO_MODE=1 npm run dev` · `npm run test:e2e` · `npm run sync` · `npm run probe:google` · `npm run probe:hevy`

## Next steps
1. You: SETUP_GOOGLE.md steps 1–13 + the Hevy BLE test.
2. Me: run probes, fix any filter/field mismatches, verify HR resolution & workout matching on real workouts, record findings here.
3. Then Phase 2b (scheduled sync, export/delete, settings) and Phase 4 (Sleep/Health tabs).
