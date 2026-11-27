# Security & privacy

## Where sensitive data lives
Everything sensitive is in a private runtime folder **outside the repository and outside OneDrive**:

| Platform | Default | Override |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Baseline` (e.g. `C:\Users\<you>\AppData\Local\Baseline`) | `BASELINE_HOME` |
| macOS / Linux (future server) | `~/Library/Application Support/Baseline` / `$XDG_DATA_HOME/baseline` | `BASELINE_HOME` |

```
Baseline\
  config.env      secrets: APP_PASSWORD_HASH, SESSION_SECRET, ENCRYPTION_KEY, GOOGLE_CLIENT_ID/SECRET
  data\baseline.db   health database (OAuth tokens + Hevy key inside, AES-256-GCM encrypted)
  backups\        manual, daily automatic and pre-restore backups
  exports\        personal exports (CSV), deleted after 7 days
  probe-output\   real-data structure reports
  logs\           server logs (supervisor + Next; counts/statuses only), 14 days
  server-status.json  supervisor state (pids, restarts; no health data)
  auth-state.json     revoked session ids + recent failed logins (no secrets)
```

**Enforced, not just documented:** `assertSafeLocation()` (`src/server/runtime-home.ts`) refuses to open the database or write config, backups or probe reports inside a OneDrive folder (detected from `%OneDrive%`, `%OneDriveCommercial%`, `%OneDriveConsumer%` and by path name) or inside the repository. Since 0.6.0 it judges both the path as written and where it really lives: symbolic links and Windows junctions are resolved (`realpathSync.native` on the nearest existing folder), so a junction into OneDrive or the repo is refused too. Unit-tested.

**Folder permissions:** `npm run configure` removes inherited ACLs and grants only your user + SYSTEM. This was necessary: on this PC `%LOCALAPPDATA%` grants read access to an extra local group (installed by a developer tool). Verify with `icacls %LOCALAPPDATA%\Baseline`.

**`.env.local` is no longer used.** In a synced or public repo it would leak secrets. Next.js still auto-loads repo `.env*` files, so since 0.6.0 the app **refuses to start** if any of them (`.env`, `.env.local`, `.env.development[.local]`, `.env.production[.local]`, `.env.test[.local]`) contains a secret key. The error names the file and key, never the value. Configuration precedence: real environment variables → `config.env`.

**Entering secrets:** `npm run configure` uses hidden prompts (no echo, not in shell history, never in chat). The Google client can also be imported from the downloaded `client_secret_*.json`, which is then deleted. The Hevy key is entered in the app's password field and goes straight into the encrypted DB.

## Other controls
| Control | Implementation |
|---|---|
| App login | scrypt password hash (N=2^15, r=8, p=1). Login and logout accept same-origin requests only |
| Sessions | HMAC-SHA256 signed cookie with a random id and issue time (30 d sliding, httpOnly, SameSite=Lax, Secure over HTTPS). **Revocable:** logout revokes that session server-side (a copied cookie stops working at once; other devices stay signed in). Changing the app password (`npm run configure -- password`) ends every session. Revocations persist in `auth-state.json`; a corrupt file fails closed (everyone signs in again) |
| Brute-force brake | 10 failed password checks in 15 min lock login (and the delete-all password check) for the rest of the window. Stored in `auth-state.json`, so a restart does not reset it |
| Network exposure | dev/prod servers bind to **127.0.0.1** only. Remote access only through Tailscale Serve (tailnet-only HTTPS), never Funnel, no open ports. See [DEPLOYMENT](DEPLOYMENT.md) |
| Tailnet gate | Fails closed. Funnel traffic is always refused (403). A request counts as local only if it shows no sign of a proxy (no Tailscale identity or Funnel header; `X-Forwarded-For`/`-Host` are loopback) **and** has a loopback Host, so a forged `Host: localhost` through Serve cannot skip the checks. Everything else needs a Tailscale identity; `TAILNET_ALLOWED_LOGINS` restricts to the owner's login |
| Headers | `Content-Security-Policy` (everything `'self'`, incl. `connect-src`; `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, restrictive `Permissions-Policy`, no `X-Powered-By` |
| Caching | `Cache-Control: private, no-store` on every page and API response; no service worker, so no offline copy of health data on the phone |
| Route protection | `src/proxy.ts` on every page/API. Handlers re-check. Mutations require same origin |
| OAuth | Authorization Code + PKCE (S256) + state in an encrypted 10-min cookie. Read-only scopes. Disconnect revokes at Google |
| Logs | Production logs go to `BASELINE_HOME\logs` only (see DEPLOYMENT). Next dev request logging and browser-log forwarding disabled (request URLs can contain OAuth codes; `.next/dev/logs` sits in the synced repo). Sync errors sanitized. Probes print structure only |
| Repo | `.gitignore` excludes env files, `config.env`, Google `client_secret*.json`, keys and certificates, SQLite databases and sidecars, CSV exports, backups, logs, temp files, mobile signing files and IPAs. Fixtures are fictional. CI ([ci.yml](../.github/workflows/ci.yml)) runs gitleaks over the full history and refuses tracked database/credential file types on every push and PR |
| Third parties | no analytics, no AI services, no external scripts |

## Public repository: the privacy trade-off
The GitHub repository is **public** on purpose: GitHub-hosted macOS runners are free for public repositories, and the planned iPhone app needs them to build. What that means:
- Everything committed is world-readable and may be cached or mirrored: code, docs, **commit metadata (author name and e-mail)**, Actions logs and artifacts. Deleting something later does not unpublish it.
- So no real data, credentials, hostnames or personal identifiers are ever committed. Docs use placeholders (`<machine-name>.<tailnet-name>.ts.net`). CI uses fictional data only and uploads no test artifacts. The full history is secret-scanned in CI and was audited for 0.6.0 ([RELEASE_AUDIT](RELEASE_AUDIT.md)).
- Commit with GitHub's private no-reply address (GitHub → Settings → Emails → *Keep my email addresses private*, then `git config user.email <id>+<user>@users.noreply.github.com`).
- Keep GitHub secret scanning and push protection enabled (repository Settings → Advanced Security). The iOS workflow uses no secrets; the iOS OAuth client ID is a public value stored as a repository *variable*.
- If the trade-off changes (a paid plan or a self-hosted macOS runner), the repository can be made private without code changes.

## Residual risks / accepted
- **Health data at rest is plain SQLite** (database and backups), protected by the user-only folder ACL; provider tokens inside are AES-256-GCM encrypted. Full database encryption (SQLCipher) would need a non-standard native build and a risky migration for little gain on a single-user PC, where anyone running as your Windows user could also read the key. Mitigation: turn on **BitLocker / Device Encryption** (Windows Settings → Privacy & security → Device encryption) so a lost or stolen disk is unreadable.
- **Code running as your Windows user** (malware, any local process) can read the runtime folder and reach the app on 127.0.0.1. Loopback requests pass the tailnet gate; the password is still required.
- **The login brake is global**, not per client (single user): someone on your tailnet could keep login locked by failing repeatedly. They still cannot get in without the password; `TAILNET_ALLOWED_LOGINS` limits who can reach the app.
- **Sliding sessions** are renewed while in use; a renewed cookie's predecessor stays valid until its own expiry unless that session logs out. Changing the password ends all sessions.
- **The CSP allows `'unsafe-inline'` scripts** (Next.js inline bootstrap without per-request nonces). React escapes all output and no raw HTML is rendered; `connect-src 'self'` blocks sending data to other hosts.
- **Dev-only dependency advisory:** drizzle-kit bundles an old esbuild (GHSA-67mh-4wv8-2f99, moderate; affects esbuild's own dev server, which Baseline never runs). Production dependencies: 0 known vulnerabilities.
- `.next/` and `node_modules/` sync to OneDrive (build artefacts only; no health data or secrets, verified). Moving the repo out of OneDrive would remove this. Optional.
- Demo database `data/demo.db` is fictional and may live in the repo (git-ignored).
- Backups require `ENCRYPTION_KEY` to decrypt stored tokens: keep a copy of `config.env` in your password manager, not in OneDrive.

## Your data: backup, restore, export, retention, deletion
Everything below stays in `BASELINE_HOME`, outside OneDrive and Git. Settings → **Your data** in the app, or `npm run data -- …` on the PC.

| Action | How | Notes |
|---|---|---|
| Back up | Settings → Back up now · `npm run backup` | SQLite online backup, consistent while the server runs → `backups\baseline-<time>-manual.db` |
| Automatic backups | daily after a sync; keep 7 / 14 (default) / 30, or off | only automatic backups are pruned; manual and pre-restore backups stay until you delete them |
| Verify | `npm run data -- verify <backup>` | integrity check, required tables, row counts |
| Restore | `npm run data -- restore <backup>` (PC only) | verifies the backup, stops the service (waits for a sync), keeps a `pre-restore` safety copy, swaps the database, applies migrations, starts again. Verified end to end on the owner's data on 2026-11-26 |
| Export | Settings → Export · `npm run data -- export` | one CSV per table, plus `daily_summary.csv`, README and manifest → `exports\baseline-export-<time>\`. Deleted after 7 days. Credentials and raw API responses are not exported. Spreadsheet formulas are neutralised |
| Daily summary | Settings → Download | one CSV, every metric per day; works on the iPhone |
| Disconnect a provider | Settings → Connections → Disconnect | revokes Baseline's Google grant and erases stored tokens; imported data is kept |
| Delete everything | Settings → Delete all data (password + type DELETE) · `npm run data -- delete-all` | revokes Google, erases every table with `secure_delete` then VACUUM + WAL truncate, deletes backups, exports, probe output and logs. `config.env` stays so you can sign in |

**Retention** (applied after each sync, `src/server/data/retention.ts`). The defaults never lose a measurement:
- Measurements, sleep, workouts and daily values: kept until you delete them.
- Raw API responses (a re-processing cache): 90 days by default (30 / 90 / 365 / forever).
- Sync history: 90 days. Exports: 7 days. Server logs: 14 days.

Backups contain health data in plain SQLite, protected by the folder's user-only ACL. Provider tokens inside them are encrypted with `ENCRYPTION_KEY`. Keep a copy of `config.env` in your password manager, not in OneDrive, or restored tokens cannot be decrypted; you would then just reconnect Google.

**Remove Baseline completely:** `npm run data -- delete-all`, `npm run service -- uninstall`, `npm run configure -- tailscale-off`, then delete `%LOCALAPPDATA%\Baseline`. Optionally also check https://myaccount.google.com/permissions.

## Future always-on server
Set `BASELINE_HOME` (e.g. `/var/lib/baseline`) or inject the same keys as real environment variables. Nothing else changes.
