# Agent guide

Read first: `docs/PROJECT_STATUS.md` (current state, blockers), then `docs/ARCHITECTURE.md`.

## Stack
Next.js 16 (App Router; **`src/proxy.ts` replaces middleware**) · React 19 · TypeScript strict · Tailwind 4 (tokens in `src/app/globals.css`) · Motion · SQLite via better-sqlite3 + Drizzle · Vitest · Playwright. Node ≥ 22.12, ESM (`"type": "module"`).

## Map
- `src/server/providers/{google,hevy}`: API clients, OAuth, normalizers, stream definitions
- `src/server/sync`: engine (pure-ish, testable with injected clients) and `run.ts` (process lock)
- `src/server/store.ts`: raw pages + idempotent upserts · `queries.ts`: UI read models
- `src/lib/metrics`: pure versioned calculations (document every change in `docs/CALCULATIONS.md`)
- `src/ui`: primitives, icons, charts · `src/app`: pages + API routes
- `scripts/`: setup, sync, probes, demo seed · `tests/`: unit, integration, e2e, fictional fixtures

## Rules
- Never commit secrets, `.env*`, databases, `probe-output/`, or real health data. Fixtures must be fictional.
- Sensitive runtime data lives ONLY in `BASELINE_HOME` (`%LOCALAPPDATA%\Baseline`): config.env, DB, backups, exports, probe output. Use `runtimePaths()`/`ensureSafeDir()` from `src/server/runtime-home.ts`; never write such files into the repo (it is in OneDrive and the GitHub repo is public).
- Never ask the owner to paste secrets into chat or pass them as CLI arguments; use `npm run configure` (hidden prompts) or the in-app Hevy key field.
- Never fabricate measurements. Missing → `null`/“—”, never 0. Label estimates. Demo data only via `DEMO_MODE` + `data/demo.db`.
- New calculated metric = function + version string + doc entry (formula, reference, inputs, missing-data rule, units, limitations) + tests.
- Do not claim provider behaviour is verified unless tested against real data. Update `PROJECT_STATUS.md` and `CHANGELOG.md` at each milestone.
- Schema change: edit `schema.ts` → `npx drizzle-kit generate --name <x>` → commit the migration.
- UI changes: run `npm run test:e2e` and look at `screenshots/` (both themes).
- Before committing: `npm run lint && npm test` (and e2e for UI). No force-push.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
