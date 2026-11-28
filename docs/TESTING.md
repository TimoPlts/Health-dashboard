# Testing

| Command | What |
|---|---|
| `npm test` | Vitest unit + integration (Node, in-memory SQLite, mocked HTTP; fictional fixtures) |
| `npm run lint` | TypeScript strict typecheck (`tsc --noEmit`) |
| `npm run db:seed-demo && npm run test:e2e` | Playwright: iPhone 15 Pro dark + light, desktop. Login/auth, all pages, axe WCAG 2 A/AA (serious+critical fail the test), no horizontal overflow, full-page screenshots → `screenshots/` (git-ignored) |
| `npm run build` | production build |
| `npm audit --omit=dev` | production dependency audit (CI fails on high/critical) |
| `npm run probe:google` / `probe:hevy` | **real-data** structure probes (manual, need credentials; never in CI) |

## Your real data is out of reach of every test
- **Vitest** (`vitest.config.ts`) gives every run a fresh temporary `BASELINE_HOME` and `DATABASE_PATH`; tests open `:memory:` databases or their own temp folders. `tests/unit/security.test.ts` → *test isolation* fails if the runtime home is not that temp folder.
- **E2E** runs `next dev` with `DEMO_MODE=1` (fictional `data/demo.db`) and an isolated `BASELINE_HOME` in the temp folder, so it never reads your real `config.env`. Backup, export and delete-all refuse to run in demo mode, and the sync scheduler is off.
- **CI** ([ci.yml](../.github/workflows/ci.yml)) has no secrets and no runtime folder, sets `BASELINE_HOME` to a runner temp folder, uses fictional data only and uploads **no** artifacts (no screenshots, traces or databases).

## Installing dependencies (Windows and CI)
`better-sqlite3` 13 ships prebuilt N-API binaries for Windows, macOS and Linux inside the npm package, so nothing has to be compiled. Plain `npm ci` still tries `node-gyp rebuild` (the lockfile does not record the package's `gypfile: false`) and fails without Visual Studio Build Tools. Use:
```
npm ci --ignore-scripts && npm rebuild esbuild
```
esbuild is the only dependency with a real install script. Node 22 LTS is what CI uses.

## Release checks (0.6.0, repeated for 0.7.0)
`npm run lint` · `npm test` · `npm run db:seed-demo && npm run test:e2e` · `npm run build` · gitleaks over the full history · `npm audit` · a production smoke test (`next start` with an isolated home and throwaway secrets: headers/CSP, login, CSRF, logout revocation, tailnet gate, login brake across a restart) and a browser pass over every page of the production build checking for CSP violations. Results: [RELEASE_AUDIT](RELEASE_AUDIT.md).

`tests/unit/runtime-home.test.ts` covers the storage-safety guard (OneDrive/repo rejection, home resolution, config parsing).

## Coverage map
- `tests/unit/metrics.test.ts`: HR stats (weighting, gaps, nulls, window bounds), zones (Karvonen, bands), TRIMP closed form, EWMA gaps, e1RM ranges, volume, muscle sets, sleep efficiency, stage minutes, baselines (min days, ln transform).
- `tests/unit/google-normalize.test.ts`: parsers (durations, int64 strings, Date), every stream has a normalizer, HR/steps/weight/daily/sleep/exercise mapping, invalid-point skipping, AIP-160 filters, window chunking.
- `tests/unit/core.test.ts`: AES-GCM (tamper/wrong key), scrypt, retry/backoff/Retry-After/no-retry-4xx/network, URL redaction, throttle, civil dates & DST bounds, sync window planning, PKCE + OAuth URL.
- `tests/unit/security.test.ts`: test isolation, session tokens (tamper, legacy format, lifetime), logout and password-change revocation across a restart, persistent login brake, corrupt state fails closed, tailnet gate (forged Host, Funnel, allowlist), symlink/junction path safety, repo env secrets stop startup.
- `tests/unit/production.test.ts`: HTTPS detection, tailnet gate, same-origin check, sliding sessions.
- `tests/unit/insights.test.ts`: personal ranges (calibration, 28-day window, log scale, deviation positions, completeness), timeline (null buckets, no line across gaps, proportional interval allocation, zone bounds, 23 h / 25 h / half-hour hour ticks, per-minute zone seconds, interval summaries), training plan (split, overrides, day statuses, adherence, consistent weeks, split history, plan matching, untrusted JSON), calendar grid and heat (missing ≠ zero).
- `tests/unit/time-boundaries.test.ts`: civil-day bounds on DST days (Brussels, New York, Lord Howe, midnight-DST Santiago); days tile without gaps over a year.
- `tests/integration/sync.test.ts`: Google backfill + pagination + raw pages + **idempotent re-run**, sleep window replacement (deletions), partial failure vs. auth abort, 401 → refresh → retry; token exchange with PKCE, `invalid_grant` → re-auth; Hevy backfill, update + delete events, replay without duplicates.

## Rules
- Fixtures are fictional and shaped after the official schemas. Never commit real responses. Probe reports are written to `%LOCALAPPDATA%\Baseline\probe-output` (outside the repo).
- A UI change is done only after looking at the screenshots (both themes, phone width).
