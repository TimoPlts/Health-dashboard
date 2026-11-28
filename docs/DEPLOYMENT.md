# Deployment: your PC as the server, your iPhone over Tailscale

Baseline runs on this Windows PC. Your iPhone reaches it over your private Tailscale network with HTTPS. Nothing is exposed to the internet, and no hosting is involved.

```
iPhone (Tailscale app) ──WireGuard──▶ tailscaled on the PC ──HTTPS :443 (Tailscale Serve)──▶ 127.0.0.1:3000 (Next.js, production)
                                                                                                │
                                                                       supervisor (scripts/server.mjs) — Task Scheduler "Baseline"
```

## Layers of protection
1. **Network:** Next.js listens on `127.0.0.1` only. The single way in from another device is **Tailscale Serve**, reachable only from devices in your tailnet. Funnel (public internet) is never used.
2. **Tailnet identity gate** (`src/proxy.ts → tailnetAllowed`, fails closed): Funnel traffic is always refused with 403. Every request that shows any sign of coming through a proxy must carry Tailscale's identity header, even if its Host says `localhost`. `TAILNET_ALLOWED_LOGINS` limits access to your own Tailscale login, so other people or devices shared into your tailnet are refused too.
3. **App password** and a signed, httpOnly, Secure, SameSite=Lax session cookie. The 30-day session is extended automatically while you use the app. Logging out revokes that session on the server; changing the password signs out every device. 10 wrong passwords in 15 minutes lock login, also across restarts.
4. **No caching of health data:** every page and API response is `Cache-Control: private, no-store`. Only hashed build files and icons are cacheable.
   - There is deliberately **no service worker**, so no health data is stored offline on the phone. The app needs a connection to the PC.

All of this is covered by `tests/unit/production.test.ts` and `tests/unit/security.test.ts`. Header forwarding was verified against Tailscale 1.102 on the production PC: Host is preserved, and `X-Forwarded-Host` and `Tailscale-User-Login` are added.

## One-time setup
### On the PC
1. **Tailscale admin console** (login.tailscale.com → DNS):
   - MagicDNS: on (already on).
   - **HTTPS Certificates: Enable.**
   - Privacy note: the certificate puts the machine's name (e.g. `<machine-name>.<tailnet-name>.ts.net`) in public Certificate Transparency logs. It does not grant any access. If you prefer a neutral name, rename the machine first (Machines → ⋯ → Edit machine name, e.g. `baseline`).
2. Run:
   ```powershell
   npm run configure -- tailscale    # sets PUBLIC_URL + your login as the only allowed user, starts tailnet-only HTTPS
   npm run service -- status         # shows the iPhone address
   ```
3. Optional, recommended: **start at boot** instead of at sign-in. Run this once in an **administrator** terminal in the repo folder:
   ```powershell
   npm run service -- install
   ```
   Without admin rights the task starts when you sign in to Windows (already installed that way).
4. If the PC is a laptop, it only serves while it is awake. To keep it reachable while plugged in: Settings → System → Power → *When plugged in, put my device to sleep after* → **Never**.

### On the iPhone
1. Install **Tailscale** from the App Store and sign in with the **same account**. Turn the VPN on.
   - Optional: Tailscale → Settings → **VPN On Demand**, so it reconnects by itself.
2. In **Safari**, open the iPhone address from `npm run service -- status` (`https://<pc>.<tailnet>.ts.net`). The first visit can take a few seconds while Tailscale fetches the certificate.
3. Sign in with your Baseline password.
4. Share → **Add to Home Screen** → Add. Always open Baseline from that icon. It runs full screen (standalone) with its own sign-in, which lasts 30 days and renews while you use it.

## Everyday operation
| Task | Command |
|---|---|
| Status (task, supervisor, health, last sync, iPhone address) | `npm run service -- status` |
| After changing or pulling code | `npm run service -- deploy` (stop → build → start, about 1–2 min downtime) |
| Restart / stop / start | `npm run service -- restart` / `stop` / `start` |
| Server log | `npm run service -- logs [N]` → `%LOCALAPPDATA%\Baseline\logs\server-YYYY-MM-DD.log` |
| Stop serving to the tailnet | `npm run configure -- tailscale-off` |
| Remove autostart | `npm run service -- uninstall` |

- **Sync:** the server syncs Google Health every 30 minutes (Settings → Personal). The Settings page shows the last and next sync and the server state.
- **Reconnect Google:** do it on the PC at `http://localhost:3000/settings`. The OAuth redirect is registered for localhost, so it does not work from the iPhone.
- **Upgrading (e.g. to 0.7.1) — back up first.** On the production PC:
  ```powershell
  git fetch; git switch main; git pull --ff-only
  npm run data -- backup                     # consistent backup of the live database
  npm run data -- list                       # note the newest backup's name
  npm run data -- verify <that-backup>       # must report ok (integrity + tables + counts)
  npm ci --ignore-scripts; npm rebuild esbuild
  npm run service -- deploy                  # stop → build → start
  npm run service -- status                  # healthy, last sync OK
  ```
  0.6.0 changed the session cookie format, so coming from 0.5.x the PC browser and the iPhone each sign in **once**. 0.7.0 adds no migration. 0.7.1 adds migration `0004_weight_tracking` (two new tables, nothing existing changed); it runs automatically on start, after the backup above. Sessions are kept. If anything is wrong: `npm run data -- restore <that-backup>`.
- **Development:** `npm run dev` now uses port **3001**, so it can run next to the production service. E2E uses 3100.

## Reliability
| Concern | Behaviour |
|---|---|
| Crash | The supervisor restarts Next after 2 s, doubling to at most 60 s. Verified: kill → healthy again in about 3 s. |
| Hang | `/api/health` is checked every 60 s; 3 failures → restart. |
| Supervisor killed | Task Scheduler restarts the task (every minute, unlimited). On start the supervisor frees port 3000 if a leftover Next process holds it, and never touches other programs. |
| Stop / update | `service stop` asks the supervisor to stop. It waits up to 2 min for a running sync to finish, then stops Next. |
| Hard stop (power loss, forced stop) | SQLite commits are atomic (WAL). An interrupted sync is marked `interrupted`, its lock is released when its process is gone, and the next sync resumes from the saved high-water mark. |
| Overlapping syncs | In-process join plus a cross-process lock file (CLI, server, dev server). |
| Logs | `%LOCALAPPDATA%\Baseline\logs` (outside OneDrive; user-only ACL), 14 days kept, 20 MB/day cap. Request URLs are not logged; sync logs contain counts and statuses only. |

## Known limits
- The code and `.next` build run from the OneDrive-synced repo folder. If OneDrive's *Files On-Demand* ever evicts `node_modules`, run `npm ci && npm run service -- deploy`. Moving the repo out of OneDrive removes this risk.
- `/api/health` is unauthenticated on purpose, for the supervisor. It returns only `{ ok, database, uptimeS }`, and the tailnet gate still applies to it.
