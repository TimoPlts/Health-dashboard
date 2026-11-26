# Testing

| Command | What |
|---|---|
| `npm test` | Vitest unit + integration (Node, in-memory SQLite, mocked HTTP; fictional fixtures) |
| `npm run lint` | TypeScript strict typecheck (`tsc --noEmit`) |
| `npm run db:seed-demo && npm run test:e2e` | Playwright: iPhone 15 Pro dark + light, desktop. Login/auth, all pages, axe WCAG 2 A/AA (serious+critical fail the test), no horizontal overflow, full-page screenshots → `screenshots/` (git-ignored) |
| `npx next build` | production build |
| `npm run probe:google` / `probe:hevy` | **real-data** structure probes (manual, need credentials) |

## Coverage map
- `tests/unit/metrics.test.ts`: HR stats (weighting, gaps, nulls, window bounds), zones (Karvonen, bands), TRIMP closed form, EWMA gaps, e1RM ranges, volume, muscle sets, sleep efficiency, stage minutes, baselines (min days, ln transform).
- `tests/unit/google-normalize.test.ts`: parsers (durations, int64 strings, Date), every stream has a normalizer, HR/steps/weight/daily/sleep/exercise mapping, invalid-point skipping, AIP-160 filters, window chunking.
- `tests/unit/core.test.ts`: AES-GCM (tamper/wrong key), scrypt, retry/backoff/Retry-After/no-retry-4xx/network, URL redaction, throttle, civil dates & DST bounds, sync window planning, PKCE + OAuth URL.
- `tests/integration/sync.test.ts`: Google backfill + pagination + raw pages + **idempotent re-run**, sleep window replacement (deletions), partial failure vs. auth abort, 401 → refresh → retry; token exchange with PKCE, `invalid_grant` → re-auth; Hevy backfill, update + delete events, replay without duplicates.

## Rules
- Fixtures are fictional and shaped after the official schemas. Never commit real responses. `probe-output/` is git-ignored.
- A UI change is done only after looking at the screenshots (both themes, phone width).
