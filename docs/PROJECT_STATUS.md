# Baseline: project overview

_Last updated: 2026-11-27 · branch `phase-0-foundation` · milestone A of 0.6.0 (see CHANGELOG)_

## What it is
Baseline is a private, single-user health and training app for one Fitbit Air wearer.
- It reads all data from the **Google Health API** into a local SQLite database.
- It shows the data in a mobile-first web app (Today, Sleep, Training, Trends, Health, 68 metric pages, Settings) with documented, versioned metrics: recovery, readiness, sleep score/debt/regularity, heart-rate load, zones, ACWR.
- It runs on the owner's Windows PC as a supervised production server and is reached from the iPhone over **Tailscale (tailnet-only HTTPS)**.
- It has no AI features, no cloud hosting and no paid dependencies. Runtime data stays in `%LOCALAPPDATA%\Baseline`, outside OneDrive and Git.

## What works
Verification levels: **verified on real data** › **tested** (unit/integration/E2E on fictional data) › **unverified**.

| Area | Level | Evidence / notes |
|---|---|---|
| Google OAuth, 35 data streams, no double counting | verified on real data | [METRIC_INVENTORY](METRIC_INVENTORY.md), [API_RESEARCH §1.10](API_RESEARCH.md), [ADR-0004](adr/0004-reconcile-vs-list.md) |
| 365-day backfill + incremental sync (≈ 1 min) | verified on real data | sync state never regresses; interrupted runs recorded |
| Calculations after the audit (`acwr-ewma@2`, `recovery@2`, `sleep-sri@2`, partial-day rule) | tested + run on real data | [FEATURE_AUDIT §3](FEATURE_AUDIT.md), [CALCULATIONS](CALCULATIONS.md) |
| Recovery, readiness, ACWR on real data | **calibrating** | need 14 HRV nights (≈ 2026-12-08) and 21 complete days with ≥ 10 h wear (≈ 2026-12-15) |
| Newly exposed metrics (breathing rate per sleep stage, SpO₂ low end, activity by intensity, AZM by zone) | verified on real data (structure) | night samples fall inside sleep sessions |
| Workouts from Google sessions + HR | verified on real data (structure) | Fitbit and Hevy-via-Apple-Health duplicates merged |
| Production server (build, supervisor, Task Scheduler at sign-in) | verified on this PC | crash → healthy in ≈ 3 s; graceful stop; logs in `BASELINE_HOME\logs` |
| Security headers, no-store caching, tailnet identity gate, login allowlist | verified on this PC (curl against production) | [DEPLOYMENT](DEPLOYMENT.md); `tests/unit/production.test.ts` |
| Tailscale Serve header forwarding | verified (temporary echo server, HTTP mode) | Host preserved; identity headers added |
| **HTTPS on the tailnet + iPhone install** | **unverified, blocked** | HTTPS certificates are not enabled in the owner's Tailscale admin console (next action 1) |
| Backups, verify, restore, export, retention | verified on real data | restore exercised end to end; export counts equal the database |
| Delete all data | tested (fictional) | not run on real data, by design |
| UI (all pages, dark/light, phone/desktop) | tested on the fictional demo DB | Playwright + axe, 12/12 |
| Goals, habit journal, customisable Today | tested (unit, integration, E2E on demo data) | your goals and habits start empty or as suggestions; nothing assumed |
| Workout labels, sleep detail (WASO, bedtime, overnight graphs, naps), Cardio page | tested (unit, integration, E2E on demo data) | real data: structure only; recommended bedtime needs 5 nights or a wake-up target |
| Displayed values vs the Google Health app | unverified by the owner | values equal the API exactly |

Tests at `c5c8193`: 184 unit/integration pass, typecheck clean, 12 E2E pass.

## Problems and constraints
- **Short history:** baseline-dependent scores show "Calibrating n/14" until enough nights exist. Calibration periods are not shortened.
- **iPhone access waits on one manual Tailscale setting** (HTTPS certificates).
- **Uptime:** the server runs only while the PC is on and awake. It starts at Windows sign-in; start at boot needs one admin command.
- Workouts carry no sets, reps or weights (Hevy out of scope, [ADR-0005](adr/0005-workouts-from-google.md)).
- Empty for this account: basal energy, altitude, VO₂ max, body fat, glucose, core temperature.
- Swim-length detections are unconfirmed.
- Google occasionally times out on large requests; the stream is retried on the next run.
- The repo (with `node_modules` and `.next`) is in OneDrive. Build artefacts only; see DEPLOYMENT → Known limits.
- **The GitHub repo is public:** no credentials, real values, probe output or databases are committed ([SECURITY](SECURITY.md)).

## Key decisions
- PWA + local Node server ([ADR-0001](adr/0001-pwa-plus-server.md)), SQLite ([ADR-0002](adr/0002-sqlite.md)), polling sync ([ADR-0003](adr/0003-polling-sync.md)), `reconcile` for activity ([ADR-0004](adr/0004-reconcile-vs-list.md)), workouts from Google sessions ([ADR-0005](adr/0005-workouts-from-google.md)).
- **Remote access:** Tailscale Serve only, never Funnel or open ports. The app binds to 127.0.0.1, refuses forwarded requests without a tailnet identity, and limits access to the owner's Tailscale login.
- **No service worker and `no-store` everywhere:** no health data is cached on the phone.
- The Google OAuth redirect stays on localhost, so Google is reconnected on the PC and the OAuth client needs no change.
- Missing data is `null`/"—", never 0. Today's partial totals are labelled "so far" and excluded from averages.
- Recovery requires HRV. Weights of recovery and the sleep score are labelled app choices, not tuned.
- Measurements are never pruned. Only caches, history and exports have retention.
- Design is reviewed only on fictional demo data.

## Next three actions
1. **Owner, about 5 min:** Tailscale admin console → DNS → enable **HTTPS Certificates**. Then run `npm run configure -- tailscale` on the PC and follow [DEPLOYMENT → On the iPhone](DEPLOYMENT.md) (Tailscale app, open the address in Safari, Add to Home Screen).
2. **Owner:** for start-at-boot, run `npm run service -- install` once from an administrator terminal. Compare three days with the Google Health app (`npm run verify:google -- 3 --show-values`).
3. **Development:** roadmap R1 (manual workout labels) and R4 (sleep page depth) ([ROADMAP](ROADMAP.md)). From 2026-12-08, review recovery and readiness against how you feel.

## Commands
`npm run service -- status|deploy|restart|logs|install` · `npm run configure [-- tailscale|status]` · `npm run data -- backup|list|verify|restore|export|delete-all` · `npm run sync` · `npm run check:analytics` · `npm run verify:google [-- N] [--show-values]` · `npm run dev` (port 3001) · `npm test` · `npm run lint` · `npm run test:e2e` (needs `npm run db:seed-demo`)

## Documentation
[README](../README.md) · [Deployment & iPhone](DEPLOYMENT.md) · [Feature audit](FEATURE_AUDIT.md) · [Architecture](ARCHITECTURE.md) · [API research](API_RESEARCH.md) · [Metric inventory](METRIC_INVENTORY.md) · [Calculations](CALCULATIONS.md) · [Data model](DATA_MODEL.md) · [Design system](DESIGN_SYSTEM.md) · [Security](SECURITY.md) · [Testing](TESTING.md) · [Google setup](SETUP_GOOGLE.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [ADRs](adr/)
