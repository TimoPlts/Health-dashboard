# Architecture

Single-user, local-first web app (installable PWA) with a server that owns credentials, sync and storage.

```
 iPhone (Safari, Home-Screen app)          Server (Node 22, Next.js 16 — your PC or a host)
 ┌──────────────────────────┐   HTTPS     ┌────────────────────────────────────────────────────────┐
 │ React UI (src/app, src/ui)│◀──────────▶│ proxy.ts: session check on every route                 │
 └──────────────────────────┘  cookie     │ Route handlers (src/app/api): login, OAuth, sync, conn │
                                          │ Read models (src/server/queries.ts) ─▶ src/lib/metrics  │
                                          │ Sync engine (src/server/sync) ─┬─▶ Google Health client │──▶ health.googleapis.com/v4
                                          │                                └─▶ Hevy client          │──▶ api.hevyapp.com
                                          │ Store (src/server/store.ts) ─▶ SQLite (data/health.db)  │
                                          └────────────────────────────────────────────────────────┘
```

## Layers (and where they live)
| Concern | Location | Notes |
|---|---|---|
| UI | `src/app/**/page.tsx`, `src/ui/*` | Server Components render read models; client components only for interaction (tab bar, charts, forms). |
| Auth (app) | `src/proxy.ts`, `src/server/session.ts`, `guard.ts`, `/api/auth/login` | scrypt password hash in env; HMAC-signed cookie; same-origin check on mutations. |
| Provider auth | `src/server/providers/google/oauth.ts`, `connections.ts` | OAuth code + PKCE; tokens AES-256-GCM encrypted in DB; auto refresh; `invalid_grant` → `reauth_required`. |
| Provider clients | `src/server/providers/{google,hevy}/client.ts` | thin, typed, throttled, retrying (`http.ts`). |
| Normalization | `src/server/providers/google/normalize.ts`, `store.ts` (Hevy) | pure functions → provider-neutral rows, unit-normalized. |
| Raw storage | `raw_pages` table | every response body verbatim (gzip) + request key; allows re-normalization. |
| Normalized storage | `heart_rate_samples`, `observations`, `daily_metrics`, `sleep_*`, `exercise_sessions`, `hevy_*` | see DATA_MODEL.md |
| Sync | `src/server/sync/engine.ts`, `run.ts`, `scripts/sync.ts` | per-stream state, backfill + lookback, idempotent upserts, one run at a time. |
| Calculated metrics | `src/lib/metrics/*` | pure, versioned, tested; computed on read (cheap at single-user scale). |
| Settings | `settings` table | schema exists; UI planned. |

## Key decisions (ADRs in `docs/adr/`)
- **0001** PWA + Node server, not native, for v1: all sources are cloud APIs; HealthKit/BLE not needed.
- **0002** SQLite (better-sqlite3 + Drizzle): single user, zero ops, trivial backup (one file).
- **0003** Polling sync with lookback instead of Google webhooks: no public endpoint needed. Webhooks can be added when hosted.
- **0004** Google `reconcile` for activity interval types, `list` (google-wearables) for vitals: prevents phone + band double counting while keeping provenance for HR.

## Sync algorithm (per Google stream)
1. Window = [today − BACKFILL_DAYS, tomorrow) on first run, otherwise [syncedThrough − lookbackDays, tomorrow).
2. Split into `chunkDays` windows (1 day for HR). For each: page through `list`/`reconcile`, store raw page, normalize, upsert in one transaction, advance `syncedThroughMs`.
3. Session streams (sleep, exercise) *replace* their window: records no longer returned by the provider are deleted (edits/deletions propagate).
4. Errors are recorded per stream. Other streams continue. 401/403/OAuth errors stop the run (no hammering).

Hevy: templates full refresh → workouts full backfill once → afterwards `/v1/workouts/events?since=cursor` (updates upsert, deletes soft-delete). Cursor = sync start − 5 min.

## Time handling
- Storage: UTC epoch ms + provider-supplied UTC offset (Google gives offsets per sample/interval).
- Civil days: Google offset where present, else `HOME_TIME_ZONE` (IANA) via `Intl`, which handles DST (23/25 h days are tested).
- Hevy timestamps are UTC with no offset; workouts are attributed to civil days via `HOME_TIME_ZONE`.
- Workout ↔ HR matching: samples with `startMs ≤ t < endMs` (stats). The chart shows −5/+10 min context. With multiple HR sources, the source with the most samples in the window wins (no merging).

## Future native client
The UI talks only to its own server. A future Expo/Swift client (for live BLE HR or HealthKit) would call the same server through JSON endpoints. Read models in `queries.ts` are already plain-JSON shaped.
