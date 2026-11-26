# Baseline

A private, single-user health & training app that combines **Fitbit Air** data (Google Health API) with **Hevy** strength workouts in an iPhone-first, installable web app. No AI, ads, social or subscriptions. All personal data stays on your machine.

> Status: Phase 1 — real-data integration. See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Run it (Windows)
```powershell
npm install
npm run configure      # hidden prompts: app password (+ Google OAuth client when you have it)
npm run dev            # http://localhost:3000 (bound to 127.0.0.1)
```
Secrets, the database, backups and reports live in `%LOCALAPPDATA%\Baseline`, **outside OneDrive and Git** (enforced; see [docs/SECURITY.md](docs/SECURITY.md)). Connecting accounts: [docs/SETUP_GOOGLE.md](docs/SETUP_GOOGLE.md).

UI preview with fictional data: `npm run db:seed-demo`, then `$env:DEMO_MODE=1; npx next dev`.

## Commands
| | |
|---|---|
| `npm run configure [-- status\|password\|google]` | manage local secrets (never echoed) |
| `npm test` · `npm run lint` · `npm run test:e2e` | tests · typecheck · Playwright + axe + screenshots |
| `npm run sync` | CLI sync (schedulable via Task Scheduler) |
| `npm run probe:google` · `npm run probe:hevy` | real-data structure probes (no values) |
| `npm run backup` | consistent DB backup into the runtime folder |

## Docs
[Product](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [API research](docs/API_RESEARCH.md) · [Metrics](docs/METRIC_INVENTORY.md) · [Calculations](docs/CALCULATIONS.md) · [Data model](docs/DATA_MODEL.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Roadmap](docs/ROADMAP.md) · [Status](docs/PROJECT_STATUS.md) · [ADRs](docs/adr/)
