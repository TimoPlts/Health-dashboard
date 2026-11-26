# Standalone iPhone app: technical plan

_2026-11-26 · branch `ios-feasibility` · status: **free CI build verified; on-device checks pending**_

**Goal:** Baseline as a real iPhone app on the owner's phone only. It syncs Google Health directly, computes everything on the device and stores the data locally. It costs €0 and needs no always-on computer, no Tailscale and no paid Apple membership. The current web app (`phase-0-foundation`) stays as a fallback.

**Evidence levels:**
- **[verified]** tested by us
- **[doc]** stated in official documentation
- **[3p]** third-party source
- **[to test]** answered by the proof-of-concept app ([ios-poc/README.md](../ios-poc/README.md))

## 1. Architecture

```
iPhone (one app, sideloaded with SideStore)
├─ WKWebView (Capacitor 8): the existing React UI and design (Liquid Glass, charts, sheets)
│   └─ TypeScript core, moved from src/server → runs in the app:
│       sync engine (35 streams), normalizers, analytics (src/lib/metrics, analytics/*), read models
├─ Native plugins (free, MIT)
│   ├─ SQLite: @capacitor-community/sqlite → Library/ (not web storage, which iOS may purge)
│   ├─ Keychain: capacitor-secure-storage-plugin → Google refresh token
│   ├─ HTTP: CapacitorHttp → native requests to Google (no CORS)
│   ├─ OAuth: Safari View Controller (@capacitor/browser) + custom URL scheme (@capacitor/app)
│   └─ Background: BGAppRefreshTask (small native Swift)
└─ No server. Network traffic only to accounts.google.com, oauth2.googleapis.com, health.googleapis.com.
```

**Build and install**
1. GitHub Actions on the free macOS runner (public repo) builds an **unsigned IPA**.
2. It is published as a GitHub Release with a **SideStore source** (a JSON feed).
3. SideStore on the iPhone installs and updates Baseline from that source, re-signing it with the owner's **free Apple ID**.
4. SideStore re-signs every 7 days, **on the iPhone itself** (LocalDevVPN + Wi-Fi).

## 2. Findings per requirement

| Requirement | Finding | Level |
|---|---|---|
| Reuse the React UI with Capacitor | Capacitor 8 needs iOS 15+ and Xcode 26 ([docs](https://capacitorjs.com/docs/ios)). The UI is React; Next.js can **static-export** (`output: "export"`), which Capacitor serves from the app bundle. | [doc] |
| No Next.js server at runtime | Pages become client components that call a **data port** (§3). The same UI builds for the web fallback (server adapter) and for iOS (device adapter). Routes with dynamic IDs become query parameters (`/training?id=`). | design |
| Local SQLite | `@capacitor-community/sqlite` 8.1.1 (MIT): iOS file database, optional SQLCipher encryption. Web storage (IndexedDB) is not used for health data, because iOS can evict it. | [doc] + [to test] persistence, speed |
| Google tokens in the Keychain | `capacitor-secure-storage-plugin` 0.14.2 (MIT, Capacitor 8): iOS Keychain, not synced to iCloud, readable after the first unlock after reboot, which background sync needs. | [doc] + [to test] survives 7-day re-sign |
| Native Google OAuth with PKCE, no secret | Google's **iOS** OAuth client type has **no client secret**. The token exchange uses PKCE; the redirect is the reversed client ID (`com.googleusercontent.apps.<id>:/oauth2redirect`) ([Google](https://developers.google.com/identity/protocols/oauth2/native-app)). Google blocks embedded web views but allows Safari View Controller. **The existing web client and its secret are not used.** | [doc] + [to test] |
| Personal OAuth mode + restricted Health scopes | **Verified for the web client:** Personal mode grants the restricted `googlehealth.*` scopes with no 7-day expiry. Whether the same Personal-mode project accepts an **iOS** client is not documented. Fallback: an External/Testing project with an iOS client, whose refresh token expires after 7 days. That matches the weekly SideStore refresh, so it means one sign-in per week. | [verified] web · [to test] iOS |
| Sync and calculations on the phone | All sync, normalisation and analytics code is TypeScript without Node-only dependencies except `better-sqlite3` and `node:` APIs (crypto, zlib, fs). Port: an async database adapter (Drizzle supports an async SQLite proxy driver), Web Crypto, and `CompressionStream` for raw pages (or drop raw pages on the phone). | design (§4) |
| Offline access | All pages read from local SQLite. Without a network, the app shows the last synced data and a "last synced" time. | design |
| Sync when the app opens | Incremental sync took about 1 min on the PC (35 streams, ~40 requests). On the phone it runs on `resume`, at most every 15 min, while the UI shows cached data. | design + [to test] speed |
| Background sync | `BGAppRefreshTask`: iOS decides when, roughly 30 s per run ([Capacitor](https://capacitorjs.com/docs/apis/background-runner)). Background modes are an **Info.plist** setting, not an entitlement. Plan: a small native task refreshes the token and fetches the last day of the main streams; full processing happens on the next app open. Best effort only. | [doc] + [to test] free signing |
| Free IPA build | GitHub-hosted **standard runners are free for public repositories**, macOS included ([GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). The workflow builds with `CODE_SIGNING_ALLOWED=NO`, then ad-hoc signs so SideStore can read the requested entitlements. | **[verified]** run #1, 2026-11-26: `macos-15` runner, Xcode 26.3, iOS 26.2 SDK. IPA ≈ 2 MB with all plugins, background modes and BGTask ID; HealthKit entitlement only in the HealthKit variant. No secrets used. |
| Install from Windows | `iloader` (open source) on Windows installs SideStore over USB (needs iTunes / Apple Mobile Device Support) and places the pairing file ([SideStore docs](https://docs.sidestore.io/docs/installation/install), [iloader](https://github.com/nab138/iloader)). | [doc] + [to test] |
| Free Apple account limits | 7-day signatures, **3 sideloaded apps at once** (SideStore takes one), **10 App IDs per 7 days** ([3p](https://github.com/pwnapplehat/iPASide)). Push notifications, iCloud, App Groups and Associated Domains are not available on a free team ([3p](https://cert.fish/guide/methods/free-apple-account)). | [3p] |
| Refresh every 7 days on the iPhone | SideStore refreshes on the device while **LocalDevVPN** (App Store, free) is connected, on Wi-Fi. It can refresh automatically in the background; tapping the 7-day counter forces it. A **pairing file** may need replacing after an iOS update or a reset (iloader on the PC again). | [doc] |
| Update without losing data | Installing a newer IPA with the **same bundle ID** over the existing app keeps its container (Library/ with the SQLite file) on iOS. SideStore docs do not state this explicitly. | [to test] (POC build N → N+1) |
| HealthKit later | Needs the `com.apple.developer.healthkit` entitlement. Whether a free team gets it is **not documented**. The POC ships a HealthKit variant to answer this on the device. | [to test] |
| Bluetooth heart rate later | CoreBluetooth needs only an Info.plist usage string, no entitlement, so it works with free signing. Plugin: `@capacitor-community/bluetooth-le` (MIT). Background BLE would need the `bluetooth-central` background mode (Info.plist). | [doc] |

## 3. Code structure after migration
- `src/core/`: pure TypeScript shared by web and iOS.
  - `metrics`: unchanged.
  - `analytics`: async.
  - `sync` engine: provider client with an injected `fetch`.
  - normalizers and the metric registry.
- `src/data/port.ts`: `DataPort` with `todayView`, `sleepView`, `metricDetail`, `trainingView`, … (the existing read models).
  - `adapters/server.ts`: web fallback (Next route handlers, better-sqlite3).
  - `adapters/device.ts`: Capacitor SQLite + on-device sync.
- `src/app` / `src/ui`: client components, unchanged in look. They load data through `useData()` with loading and offline states.
- `ios/`: the committed Capacitor iOS project (the POC generates it in CI). Bundle ID `app.baseline.ios` is fixed forever, so updates keep data.
- Schema: the same Drizzle migrations, applied on the device at app start before any read.

## 4. Data on the phone
- **Volume:** 3-second heart rate is about 29,000 rows a day; that is the main load. The POC measures inserting and reading one day on the device.
  - Fallback if too slow: compute derived metrics (TRIMP, zones, worn time) per day as soon as a day is complete, keep raw heart rate for 90 days on the phone, and re-fetch from Google if it is ever needed again.
- **Backfill:** heart rate exists only since 2026-11-24, so the first sync is short. Other streams use 365 days, as now.
- **At-rest protection:**
  - iOS Data Protection encrypts app files while the phone is locked.
  - Plus SQLCipher with a random key in the Keychain (`ThisDeviceOnly`), so iCloud/Finder backups contain only ciphertext.
  - A restored phone re-syncs from Google, which remains the source of truth.
  - In-app export goes to Files.
- **Moving data from the PC:** not needed. The phone backfills from Google. Settings and workout exclusions can be imported from a small JSON export.

## 5. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Apple changes break free sideloading. In 2026 Apple-side changes broke sign-in twice, and SideStore and iloader shipped fixes within days ([SideStore](https://github.com/SideStore/SideStore/releases), [iloader](https://github.com/nab138/iloader/releases)). | The app stops opening after 7 days until SideStore works again. Data stays on the phone. | Keep the web app as a fallback, and keep SideStore and iloader updated. |
| Anisette data now comes from a public Mac anisette server run by the SideStore community ([3p](https://github.com/pwnapplehat/iPASide)) | The server sees the IP address and a random device identifier, **not** the Apple ID password or tokens (per that source). | Optional: use a separate Apple ID just for signing. |
| Personal-mode project refuses an iOS client | No permanent Google token | Use an External/Testing project: sign in again weekly, at the same time as the SideStore refresh. |
| Background refresh rarely runs | Data is fresh only after opening the app | On-open sync is the primary path; the background task is best effort. |
| Refresh missed for 7 days | The app does not open until refreshed | SideStore refreshes automatically in the background when possible. Data persists [to test]. |
| WebView performance with large HR data | Slow pages | Measured in the POC; daily derived cache as now. |

## 6. Milestones
| # | Milestone | Done when |
|---|---|---|
| **0** | **Feasibility proof** (this branch) | The IPA builds for free in CI **[verified]**. The owner installs it with SideStore and reports the POC checks: SQLite, Keychain, update, OAuth, background, HealthKit. |
| 1 | Branch `ios-native` from `phase-0-foundation`; async data port; web app still green | All tests pass and the web app behaves the same |
| 2 | Device adapter: SQLite schema + migrations on iOS; sync engine on the device for all 35 streams | Real sync on the phone; counts match the PC for the same days |
| 3 | UI static export inside Capacitor; offline states; sync on open | Every page works in airplane mode with cached data |
| 4 | Background refresh, export to Files, delete-all, SQLCipher | Tests and a device check |
| 5 | Release pipeline: GitHub Release + SideStore source; update in place keeps data | Two consecutive updates on the phone keep all data |
