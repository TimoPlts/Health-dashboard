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
  backups\        `npm run backup`
  exports\        personal exports (planned)
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

## Backup / restore / deletion
- Backup: `npm run backup` → `Baseline\backups\`. Restore: stop the app, copy the file to `Baseline\data\baseline.db`.
- Delete everything: stop the app, delete `%LOCALAPPDATA%\Baseline`, revoke at https://myaccount.google.com/permissions, rotate the Hevy key. In-app export/delete is planned.

## Future always-on server
Set `BASELINE_HOME` (e.g. `/var/lib/baseline`) or inject the same keys as real environment variables. Nothing else changes.
