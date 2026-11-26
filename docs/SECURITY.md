# Security & privacy

## Threat model (single user)
Protect health data and provider credentials from: other people on the network/internet, accidental commits, logs, and third-party services.

## Controls in place
| Control | Implementation |
|---|---|
| App login | scrypt password hash (`APP_PASSWORD_HASH`), HMAC-SHA256 signed session cookie (30 d, httpOnly, SameSite=Lax, Secure on HTTPS). Brute-force brake: 10 failures / 15 min. |
| Route protection | `src/proxy.ts` blocks every page/API without a session. Route handlers re-check (`guard.ts`). Mutations require same-origin. |
| Provider secrets | Google client secret only in server env. OAuth tokens & Hevy key **AES-256-GCM encrypted** in SQLite (`ENCRYPTION_KEY`). Never sent to the browser. |
| OAuth | Authorization Code + **PKCE (S256)** + `state`. Transaction kept in an encrypted, 10-min, path-scoped cookie. Read-only scopes. Disconnect revokes at Google. |
| Logs | Sync errors are sanitized (`describeError`, `redactUrl`). No tokens, query secrets or health values are logged. Probe scripts print structure only. |
| Headers | `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, restrictive `Permissions-Policy`. `robots: noindex`. |
| Repository | `.gitignore` excludes `.env*`, `data/*`, `*.db`, `probe-output/`, screenshots. Tests use fictional fixtures only. |
| Demo data | Separate `data/demo.db`. `DEMO_MODE` throws in production. Permanent banner. |
| Third parties | No analytics, no AI services, no CDN scripts. Fonts are self-hosted by `next/font` at build time. |

## Your responsibilities
- Keep `.env.local` private and backed up (password manager). Rotating `ENCRYPTION_KEY` requires reconnecting providers.
- **Remote access must be HTTPS.** Recommended: Tailscale (private tailnet + `tailscale serve` HTTPS) rather than exposing a port to the internet.
- **OneDrive warning:** this repo lives in a OneDrive-synced folder. `data/health.db` is git-ignored but **will still be uploaded to OneDrive** (school account). Set `DATABASE_PATH` to a non-synced folder, e.g. `C:/Users/<you>/AppData/Local/pulse/health.db`. OneDrive syncing `node_modules` is also slow, so consider moving the repo to e.g. `C:\dev\`.

## Data export & deletion
Planned (ROADMAP Phase 2b): JSON/CSV export endpoint and “delete all data” (drops all rows + raw pages, revokes tokens). Until then: stop the app and delete `data/health.db*`, then revoke access at https://myaccount.google.com/permissions and rotate the Hevy API key.
