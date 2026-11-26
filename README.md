# Pulse — private health & training dashboard

Single-user app that combines **Fitbit Air** data (via the Google Health API) with **Hevy** strength workouts, in an iPhone-first, installable web app. No AI, ads, social or subscriptions. Your data stays in a local SQLite database.

> Status: foundation built and tested with fictional data. Real-data verification is waiting on credentials. See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Quick start
```bash
npm install
npm run setup -- "<app password>"     # creates .env.local with generated secrets
# add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — see docs/SETUP_GOOGLE.md
npm run dev                            # http://localhost:3000
```
Connect Google Health and Hevy under **Settings**. The first sync imports `BACKFILL_DAYS` (default 365).

UI preview with fictional data: `npm run db:seed-demo`, then start with `DEMO_MODE=1` (PowerShell: `$env:DEMO_MODE=1; npm run dev`).

## Commands
| | |
|---|---|
| `npm test` / `npm run lint` | unit + integration tests / typecheck |
| `npm run test:e2e` | Playwright (iPhone dark/light, desktop) with screenshots + axe |
| `npm run sync` | CLI sync (schedule with Windows Task Scheduler) |
| `npm run probe:google` / `probe:hevy` | real-data structure probes (no values printed) |

## Install on iPhone
Serve over HTTPS (recommended: Tailscale `tailscale serve`), open in Safari → Share → **Add to Home Screen**.

## Docs
[Product](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [API research](docs/API_RESEARCH.md) · [Metrics](docs/METRIC_INVENTORY.md) · [Calculations](docs/CALCULATIONS.md) · [Data model](docs/DATA_MODEL.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Roadmap](docs/ROADMAP.md) · [Status](docs/PROJECT_STATUS.md) · [ADRs](docs/adr/)
