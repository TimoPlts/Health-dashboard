# Baseline: project overview

_Last updated: 2026-11-28 · **v0.7.1** (body weight tracker; 0.7.0: health monitor, calendar, timeline, training planner; see [CHANGELOG](CHANGELOG.md)) · v0.6.0 security audit: [RELEASE_AUDIT](RELEASE_AUDIT.md) · features are built on branches from `main`; native iOS feasibility on `ios-feasibility`_

## What it is
Baseline is a private, single-user health and training app for one Fitbit Air wearer.
- It reads all data from the **Google Health API** into a local SQLite database.
- It shows the data in a mobile-first web app (Today, Sleep, Training with a planner, Trends, Health with a monitor, calendar and daily timeline, 68 metric pages, Settings) with documented, versioned metrics: recovery, readiness, sleep score/debt/regularity, heart-rate load, zones, ACWR.
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
| Security headers, no-store caching, tailnet identity gate, login allowlist | verified on the production PC (curl against production, 0.5.0) | [DEPLOYMENT](DEPLOYMENT.md); `tests/unit/production.test.ts` |
| 0.6.0 security hardening: revocable sessions, persistent login brake, fail-closed tailnet gate, CSP, junction-safe paths, repo-secret startup block | tested (unit + production smoke on an isolated build, 24/24; browser CSP pass over every page) | **not yet deployed to the production PC** (next action 1); [RELEASE_AUDIT](RELEASE_AUDIT.md) |
| Git history, tags, Actions logs and artifacts free of secrets and personal data | verified (gitleaks + manual audit, 2026-11-27) | [RELEASE_AUDIT](RELEASE_AUDIT.md); CI repeats the scan on every push |
| Tailscale Serve header forwarding | verified (temporary echo server, HTTP mode) | Host preserved; identity headers added |
| **HTTPS on the tailnet + iPhone install** | **unverified, blocked** | HTTPS certificates are not enabled in the owner's Tailscale admin console (next action 1) |
| Backups, verify, restore, export, retention | verified on real data | restore exercised end to end; export counts equal the database |
| Delete all data | tested (fictional) | not run on real data, by design |
| UI (all pages, dark/light, phone/desktop) | tested on the fictional demo DB | Playwright + axe, 12/12 |
| Weight & energy, weekly/monthly reports, habit associations (with safeguards) | tested (unit, integration, E2E on demo data) | real data: read models run without errors; associations need weeks of journal logging; energy balance needs an intake source |
| Goals, habit journal, customisable Today | tested (unit, integration, E2E on demo data) | your goals and habits start empty or as suggestions; nothing assumed |
| Workout labels, sleep detail (WASO, bedtime, overnight graphs, naps), Cardio page | tested (unit, integration, E2E on demo data) | real data: structure only; recommended bedtime needs 5 nights or a wake-up target |
| Weight tracker: quick morning log, dashboard, phases, history (0.7.1) | tested (unit, integration incl. backup/export/delete, E2E + axe on demo data) | **not yet deployed**; your existing Google and manual weigh-ins are kept; the day's weight now uses the morning weigh-in (weight-trend@2) |
| Health monitor (personal ranges), calendar, 24-hour timeline, training planner (0.7.0) | tested (unit, E2E + axe on demo data, both themes, phone and desktop) | **not yet run on real data or deployed** (production PC not reachable from the development PC); ranges calibrate with the same 14-day rule as recovery |
| Displayed values vs the Google Health app | unverified by the owner | values equal the API exactly |

Tests at v0.7.1: 290 unit/integration pass, typecheck clean, 33 E2E (incl. axe) pass, production build OK. CI runs all of them on every push and PR.

## Problems and constraints
- **Short history:** baseline-dependent scores show "Calibrating n/14" until enough nights exist. Calibration periods are not shortened.
- **iPhone access waits on one manual Tailscale setting** (HTTPS certificates).
- **Uptime:** the server runs only while the PC is on and awake. It starts at Windows sign-in; start at boot needs one admin command.
- Workouts carry no sets, reps or weights (Hevy out of scope, [ADR-0005](adr/0005-workouts-from-google.md)).
- Empty for this account: basal energy, altitude, VO₂ max, body fat, glucose, core temperature.
- Swim-length detections are unconfirmed.
- Google occasionally times out on large requests; the stream is retried on the next run.
- On the production PC the repo (with `node_modules` and `.next`) is in OneDrive. Build artefacts only; see DEPLOYMENT → Known limits. The development PC keeps it on a local drive.
- **The GitHub repo is public** (free macOS CI for the iPhone app): no credentials, real values, probe output or databases are committed; commit metadata is public too ([SECURITY → Public repository](SECURITY.md)).
- Health data at rest is plain SQLite behind a user-only ACL; turn on BitLocker / Device Encryption ([SECURITY → Residual risks](SECURITY.md)).

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
1. **Owner, production PC, about 5 min:** deploy v0.7.1 with a verified backup first (it adds one migration) ([DEPLOYMENT → Upgrading](DEPLOYMENT.md)). Coming from 0.5.x, sign in once on the PC and the iPhone (0.6.0 session format). Then log a morning weight from Today and open Health → Weight, Monitor, Calendar and Timeline, and Training → Training plan on real data. Not done from the development PC: the production PC is not reachable from it.
2. **Owner, about 5 min:** Tailscale admin console → DNS → enable **HTTPS Certificates** (consider a neutral machine name first: it appears in public certificate logs). Then `npm run configure -- tailscale` and [DEPLOYMENT → On the iPhone](DEPLOYMENT.md). Optional: `npm run service -- install` from an administrator terminal for start at boot.
3. **From 2026-12-08:** review recovery and readiness against how you feel; compare three days with the Google Health app (`npm run verify:google -- 3 --show-values`). Next features: R7 results once enough journal days exist; R10–R12 are conditional ([ROADMAP](ROADMAP.md)).

## Commands
`npm run service -- status|deploy|restart|logs|install` · `npm run configure [-- tailscale|status]` · `npm run data -- backup|list|verify|restore|export|delete-all` · `npm run sync` · `npm run check:analytics` · `npm run verify:google [-- N] [--show-values]` · `npm run dev` (port 3001) · `npm test` · `npm run lint` · `npm run test:e2e` (needs `npm run db:seed-demo`)

## Documentation
[README](../README.md) · [Deployment & iPhone](DEPLOYMENT.md) · [Feature audit](FEATURE_AUDIT.md) · [Architecture](ARCHITECTURE.md) · [API research](API_RESEARCH.md) · [Metric inventory](METRIC_INVENTORY.md) · [Calculations](CALCULATIONS.md) · [Data model](DATA_MODEL.md) · [Design system](DESIGN_SYSTEM.md) · [Security](SECURITY.md) · [Testing](TESTING.md) · [Google setup](SETUP_GOOGLE.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [ADRs](adr/)
