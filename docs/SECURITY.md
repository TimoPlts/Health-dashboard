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
```

**Enforced, not just documented:** `assertSafeLocation()` (`src/server/runtime-home.ts`) refuses to open the database or write config, backups or probe reports inside a OneDrive folder (detected from `%OneDrive%`, `%OneDriveCommercial%`, `%OneDriveConsumer%` and by path name) or inside the repository. Unit-tested.

**Folder permissions:** `npm run configure` removes inherited ACLs and grants only your user + SYSTEM. This was necessary: on this PC `%LOCALAPPDATA%` grants read access to a `CodexSandboxUsers` group. Verify with `icacls %LOCALAPPDATA%\Baseline`.

**`.env.local` is no longer used.** In a OneDrive-synced repo it would upload secrets to the cloud. Next.js still auto-loads repo `.env*` files, so the app warns at startup if any of them contains a secret key. Configuration precedence: real environment variables → `config.env`.

**Entering secrets:** `npm run configure` uses hidden prompts (no echo, not in shell history, never in chat). The Google client can also be imported from the downloaded `client_secret_*.json`, which is then deleted. The Hevy key is entered in the app's password field and goes straight into the encrypted DB.

## Other controls
| Control | Implementation |
|---|---|
| App login | scrypt password hash, HMAC-SHA256 signed session cookie (30 d sliding, httpOnly, SameSite=Lax, Secure when reached over HTTPS), 10 failures / 15 min brake |
| Network exposure | dev/prod servers bind to **127.0.0.1** only. Remote access only through Tailscale Serve (tailnet-only HTTPS), never Funnel, no open ports. See [DEPLOYMENT](DEPLOYMENT.md) |
| Tailnet gate | requests through Serve need a Tailscale identity (Funnel traffic has none → 403); `TAILNET_ALLOWED_LOGINS` restricts to the owner's login |
| Caching | `Cache-Control: private, no-store` on every page and API response; no service worker, so no offline copy of health data on the phone |
| Route protection | `src/proxy.ts` on every page/API. Handlers re-check. Mutations require same origin |
| OAuth | Authorization Code + PKCE (S256) + state in an encrypted 10-min cookie. Read-only scopes. Disconnect revokes at Google |
| Logs | Production logs go to `BASELINE_HOME\logs` only (see DEPLOYMENT). Next dev request logging and browser-log forwarding disabled (request URLs can contain OAuth codes; `.next/dev/logs` sits in the synced repo). Sync errors sanitized. Probes print structure only |
| Repo | `.gitignore` excludes `.env*`, `data/*`, `*.db`, `probe-output/`, `screenshots/`. Fixtures are fictional. The GitHub repo is **public**, so audit before every push |
| Third parties | no analytics, no AI services, no external scripts |

## Residual risks / accepted
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
