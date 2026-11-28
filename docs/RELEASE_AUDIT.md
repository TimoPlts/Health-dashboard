# Release audit: Baseline v0.6.0

_2026-11-27 · first release on `main` · audited branch `phase-0-foundation` (base `866acfc`) · all findings redacted: no secret or personal value appears in this document, the logs or the conversation it was produced in._

**Verdict: release.** No credential, token, password hash, health value, database, export, probe report or personal identifier was found in the Git history, tags, GitHub Actions logs or artifacts. Nothing needs to be revoked or rotated. One fail-open bug in the tailnet gate and the five reported weaknesses were fixed or explicitly accepted (below).

## 1. Scope and method
| Area | Scope | Method | Result |
|---|---|---|---|
| Git history | all 18 commits on every ref (`main`, `phase-0-foundation`, `ios-feasibility`); 0 tags; 0 stashes | gitleaks 8.30.1 (`git --log-opts=--all`, redacted) | **0 findings** |
| Personal identifiers in history | every blob of every commit | pattern search: e-mail addresses, Windows user paths, `.ts.net` names, Tailscale 100.64/10 IPs, hostnames, Google secret/token/client formats, password-hash formats, UUIDs, sensitive file names; plus an exact-match search for the owner's real identifiers (Tailscale IPs, device and tailnet names, login, e-mail addresses, Windows user name — 43 values, kept only in a temp file that was deleted afterwards) | real identifiers: **0** in file contents. Commit **metadata** carries the owner's personal e-mail (see F-5). Tailscale-looking values in tests are fictional (`example-tailnet`, `100.64.0.x`, `@example.com`) |
| Working tree | tracked, untracked and ignored files | gitleaks `dir`; `git status --ignored` | 7 hits, all in ignored local build/tool folders (`.next/dev` Next.js dev keys, a scanner's README); never committed |
| `.gitignore` | rules vs. tracked files | `git ls-files -ci --exclude-standard` | no tracked file is ignored by the new rules |
| GitHub Actions | 2 workflow runs (`ios-feasibility`), full logs | downloaded, gitleaks + identifier search | **0 findings**; only the public repo URL and the runner's own paths |
| Actions artifacts | 2 artifacts, 4 unsigned IPAs | downloaded, unpacked, gitleaks + identifier search + file-type check | **0 findings**; no provisioning profile, database or config; embedded iOS OAuth client ID is empty; deleted locally after inspection |
| GitHub settings | repository | `gh api` | public; secret scanning **on**, push protection **on**, 0 alerts; 0 Actions secrets, 0 variables; default workflow token read-only. At audit time `main` was not branch-protected and Dependabot was off; both were enabled after the release (§3) |
| Releases | — | `gh api` | none before v0.6.0 |
| Application | auth, sessions, CSRF, gate, OAuth, crypto, routes, headers, logs, files | code review + new tests + production smoke test | see §2 |
| Dependencies | lockfile | `npm audit`, usage review | see §4 |

## 2. Findings and remediation
Severity: **High** = could expose data or bypass a control · **Medium** = weakens a control · **Low** = hardening / hygiene.

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-1 | **Medium** | **Tailnet gate failed open on a forged Host.** `tailnetAllowed()` accepted any request whose `Host` was loopback *before* checking the Funnel and identity headers. A request through Tailscale Serve (or Funnel, if ever enabled) with `Host: localhost` skipped the Funnel refusal and `TAILNET_ALLOWED_LOGINS`. The app password was still required. | **Fixed.** Funnel is refused first; any sign of a proxy (identity/Funnel header, non-loopback `X-Forwarded-For`/`-Host`, which Next.js never overwrites) requires a Tailscale identity. Unit + production smoke tests. |
| F-2 | **Medium** | *(reported)* Signed sessions stayed valid after logout until expiry. | **Fixed.** Tokens carry a random id and issue time; logout revokes that id server-side; a password change revokes all sessions. Stored in `auth-state.json`; corrupt state fails closed. Old cookies are rejected (one re-login after upgrade). |
| F-3 | **Medium** | *(reported)* Login brake was in memory and reset on restart. The delete-all password check had no brake. | **Fixed.** Failures persist in `auth-state.json`; the delete-all password check shares the brake. Verified across a restart. |
| F-4 | **Medium** | *(reported)* Runtime path checks did not resolve symlinks or Windows junctions. | **Fixed.** `assertSafeLocation()` checks the written path and the real location (`realpathSync.native` of the nearest existing folder) against resolved OneDrive and repo roots. Junction test. |
| F-5 | **Low** | *(reported)* Secrets in repo-local `.env*` files only produced a warning; only 4 of the 8 files Next.js loads were checked. | **Fixed.** Startup refuses (names only, no values); all 8 files checked. |
| F-6 | **Low** | Public docs contained a machine-specific Tailscale hostname, a machine-specific local group name and one count derived from real health data. | **Fixed** in the current docs (placeholders / generic wording). The old text remains in public history (identifiers, not credentials; the hostname did not match the current tailnet). No rotation needed; optional: rename the machine before enabling HTTPS certificates. |
| F-7 | **Low** | Commit metadata of all 18 published commits contains the owner's personal e-mail. The v0.6.0 merge commit (`f486193`, created by GitHub's merge button) carries the GitHub account's e-mail, a second personal address, because *Keep my email addresses private* is off on the account. | **Mitigated.** New commits use GitHub's no-reply address; later changes reach `main` by fast-forward to the CI-verified PR commit, so GitHub creates no merge commit. Rewriting history would need a force-push, which branch protection now blocks and which was not approved (copies may already exist). Owner action: enable *Keep my email addresses private* (GitHub → Settings → Emails). |
| F-8 | **Low** | No Content-Security-Policy. | **Fixed.** CSP (`'self'` everywhere, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), plus `Cross-Origin-Opener-Policy`. Browser pass over every production page: no violations. |
| F-9 | **Low** | Login and logout did not check the request origin (login CSRF, forced logout). | **Fixed.** Same-origin required. |
| F-10 | **Low** | Tests could in principle reach the real runtime folder (none did: all used `:memory:` or temp homes). | **Fixed.** Vitest forces a throwaway `BASELINE_HOME`/`DATABASE_PATH`; a test asserts it. |
| F-11 | **Low** | `.gitignore` did not cover credential JSON, keys/certificates, SQLite3 files, CSV exports, backups, logs, temp files, signing files. | **Fixed.** |
| F-12 | **Low** | No CI on the application; no automated secret scan. | **Fixed.** `ci.yml`: gitleaks (full history + tree), tracked sensitive-file check, typecheck, tests, build, E2E + axe on fictional data, production `npm audit`. SHA-pinned actions, read-only token, no secrets, no artifacts. |
| F-13 | **Low** (correctness) | `civilDayBounds` started the day in the previous civil day for zones whose DST begins at midnight (e.g. America/Santiago). Europe/Brussels unaffected. | **Fixed** with tests (DST days in four zones; a year of days tiles without gaps). No formula changed. |
| F-14 | Info | Version mismatch: `package.json` 0.5.0, lockfile 0.1.0 under an old project name, docs 0.6.0. | **Fixed:** 0.6.0 everywhere; no dependency changed. |

Reviewed without findings: scrypt hashing with constant-time compare; AES-256-GCM token encryption with random IV; OAuth Authorization Code + PKCE (S256), 192-bit state compared in constant time, 10-minute encrypted transaction cookie, read-only scopes, revocation on disconnect; every mutating API route requires session + same origin, every read route requires a session; Zod validation on all JSON inputs; no raw HTML rendering; parameterised queries (Drizzle) — the only interpolated SQL uses fixed table names from `sqlite_master`; `/api/health` returns no personal data; logs hold counts/statuses only, request URLs are not logged; backups, export and delete-all refuse demo mode; delete-all uses `secure_delete` + VACUUM; exports neutralise spreadsheet formulas and exclude credentials.

## 3. Accepted residual risks
See [SECURITY → Residual risks](SECURITY.md). In short: health data at rest is plain SQLite behind a user-only ACL (use BitLocker / Device Encryption; SQLCipher rejected as disproportionate); code running as the owner's Windows user is trusted; the login brake is global (a tailnet member could keep login locked, not get in); a renewed session's predecessor stays valid until its expiry unless logged out; CSP needs `'unsafe-inline'` scripts for Next.js; dev-only esbuild advisory in drizzle-kit; old public history keeps the items in F-6/F-7; the repository stays public for free macOS CI (trade-off documented in SECURITY).

**GitHub settings (applied after the release, 2026-11-27):**
- **`main` is protected:**
  - both CI checks are required (*Secret scan (gitleaks, full history)* and *Typecheck, tests, build, E2E (fictional data)*), and they must come from GitHub Actions
  - force-push and deletion are blocked
  - open review conversations must be resolved
  - the rules apply to admins too, so every change reaches `main` through a PR with green CI
  - approving reviews are not required (single maintainer)
- **Dependabot alerts and security updates are enabled.** Open alert #1 is GHSA-67mh-4wv8-2f99 (esbuild, development, transitive via drizzle-kit), the accepted advisory in §4.
- Optional, not enabled: secret scanning for non-provider patterns.

## 4. Dependency and code audit
- `npm audit`: production dependencies **0** vulnerabilities. All dependencies: 4 *moderate*, one advisory (GHSA-67mh-4wv8-2f99, esbuild ≤ 0.24.2 dev-server CORS) via drizzle-kit's bundled esbuild; not reachable (Baseline never runs esbuild's server). npm's suggested fix is a major downgrade of drizzle-kit → accepted.
- Unused dependencies: none. Dead code: none removed (unreferenced exports are version constants and types used in their own modules). The Hevy client stays as tested, optional code (ADR-0005, roadmap R11).
- TypeScript strict: clean. Migrations: `drizzle-kit check` OK; the schema matches the four migrations exactly (no drift); no schema change in this release.
- Production configuration: binds to 127.0.0.1; `poweredByHeader: false`; request logging off; `no-store` on all non-static responses; `DEMO_MODE` refused in production.
- Calculations: formulas unchanged. Reviewed time-zone/day boundaries (F-13), missing-data handling (null, never 0), units and claims; docs and UI already label estimates and app-chosen weights and state "not medically validated".
- iOS portability (branch `ios-feasibility`, unchanged): before real data is stored on the phone, enable on-device database encryption (`iosIsEncryption: false` in the POC), iOS Data Protection and Keychain storage, and pin its actions to commit SHAs.

## 5. Verification
| Check | Result |
|---|---|
| TypeScript (`npm run lint`) | clean |
| Unit + integration (`npm test`) | **244 / 244** passed (18 files; 20 new security/time tests) |
| E2E + accessibility (`npm run test:e2e`, axe WCAG 2 A/AA) | **21 / 21** passed (iPhone dark, iPhone light, desktop) on the fictional demo DB |
| Production build (`npm run build`, no secrets present) | passed |
| Production smoke test (`next start`, isolated home, throwaway secrets) | **24 / 24**: health endpoint, headers + CSP, 401/redirect, cross-origin login/logout/mutation refused, login, logout revocation, other session unaffected, legacy cookie refused, Serve without identity / forged Host / Funnel refused, identity allowed, brake locks and survives restart, revocation survives restart |
| Browser pass on the production build | all 11 pages 200, client JS works, **no CSP violations or console errors** |
| Secret scan | gitleaks: history 0, commit candidates 0, Actions logs 0, artifacts 0 |
| Dependency audit | production 0; dev 4 moderate (accepted, §4) |
| CI on GitHub | passed on the release PR (#1: push and pull-request runs) and on `main` after the merge (both jobs green) |

**Real data:** no test, build or smoke run touched the owner's runtime folder (it does not exist on the development PC; every run used a temp home). No real data, log, database or configuration was uploaded to GitHub, CI, the PR or the release.

**Production PC:** not reachable from the development PC. The deployment runbook with a verified backup first is in [DEPLOYMENT → Upgrading](DEPLOYMENT.md); after it, the PC browser and the iPhone sign in once.

## 6. v0.7.0 release checks (2026-11-28)
v0.7.0 adds four views (health monitor, calendar, daily timeline, training planner) and one mutating route, `POST /api/training/plan`. No dependency, database schema or security control changed. The training plan is stored in the existing `settings` table.

| Check | Result |
|---|---|
| TypeScript, unit + integration | clean · **268 / 268** (24 new in `tests/unit/insights.test.ts`) |
| E2E + axe (iPhone dark, iPhone light, desktop; fictional demo DB) | **27 / 27**, including the four new pages, timeline interval selection and a plan adjustment; no horizontal overflow |
| Production build | passed |
| Production smoke test (isolated home, throwaway secrets) | **46 / 46**: the v0.6.0 checks plus every new page requires login and renders on an empty database (including both 2026 DST days in the timeline). The plan API refuses cross-origin (403), unauthenticated (401) and invalid bodies (400), and saves, overrides and removes a plan. |
| Browser pass on the production build | 16 pages (the new ones included): no CSP violations or console errors |
| Secret scan | gitleaks: full history (all refs) 0; `src`, `scripts`, `tests`, `docs` 0 |
| Dependency audit | production 0; dev unchanged (the accepted esbuild advisory, §4) |
| New route review | session + same-origin guard (`guardMutation`); Zod schema (7-day split, names ≤ 40 characters, fixed category enum, ISO date); stored value re-normalised by `normalisePlan`; no provider data touched |

**Not verified:** v0.7.0 has not run on real data or on the production PC, because that PC is not reachable from the development PC. Deploy with the backup-first runbook ([DEPLOYMENT → Upgrading](DEPLOYMENT.md)).

## 7. v0.7.1 release checks (2026-11-28)
v0.7.1 expands body-weight tracking.
- **Routes:** three mutating routes (`POST/PATCH/DELETE /api/weight`, `POST /api/weight/morning`, `POST /api/weight/phases`).
- **Migration:** one additive migration (`0004_weight_tracking`: two new tables). No dependency or security control changed.
- **User-entered data:** notes, the daily morning choice and phases. All of it is local only and covered by backup/restore, export and delete-all.

| Check | Result |
|---|---|
| TypeScript, unit + integration | clean · **290 / 290** (22 new). Includes the upgrade from a 0.7.0 database (existing weigh-ins survive migration 0004) and backup/restore, export and delete-all of the new data |
| E2E + axe (iPhone dark, iPhone light, desktop; fictional demo DB) | **33 / 33**: quick log from Today, dashboard ranges and chart inspection, phase edit, history edit and designation, weight calendar; no horizontal overflow |
| Production build | passed |
| Production smoke test (isolated home, throwaway secrets) | **69 / 69**. Weight pages require login and render with no data. The weight API refuses cross-origin (403), unauthenticated (401), out-of-range, future-dated and over-long-note requests (400). A morning log is corrected in place, unknown entries return 404, and phases are validated with overlaps refused |
| Browser pass on the production build | 19 pages: no CSP violations or console errors |
| Secret scan | gitleaks: full history 0; `src`, `scripts`, `tests`, `docs` 0 |
| Dependency audit | production 0; dev unchanged (§4) |
| New route review | every mutation uses `guardMutation` (session + same origin) and a Zod schema (kg 25–350, ISO dates, note ≤ 200, rate ±2 kg/week, phase kind enum, UUID ids). Google weigh-ins cannot be edited or deleted; only Baseline's own manual rows are changed |

**Not verified:** not yet run on real data or on the production PC (not reachable from the development PC). Deploy with the backup-first runbook; the migration runs on start after the backup.
