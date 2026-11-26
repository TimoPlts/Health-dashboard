# Setting up credentials (≈ 20–30 min, one-off)

## 0. Prerequisites
- Your Fitbit Air is paired and syncing in the **Google Health** app on your iPhone, signed in with the Google account you will connect. This links the account; otherwise the API returns `ACCOUNT_NOT_LINKED`.
- Node 22, then `npm install` in the repo.
- Create the local secrets file: `npm run setup -- "<choose an app password, ≥10 chars>"` → writes `.env.local` (git-ignored).

## 1. Google Cloud project & Google Health API
1. Open https://console.cloud.google.com → project picker → **New project** (e.g. `pulse-personal`). A personal Google account is fine. No billing account is needed for this API at personal volumes (if the console asks for billing, stop and tell me).
2. **APIs & Services → Library** → search **“Google Health API”** (`health.googleapis.com`) → **Enable**.

## 2. OAuth consent (Google Auth Platform)
3. **Google Auth Platform → Branding:** app name `Pulse (personal)`, your email as support + developer contact. Leave logo/links empty.
4. **Audience:** User type **External**. Under *Test users* add **your own Google account**.
5. **Data Access → Add or remove scopes** → filter “Google Health API” → tick exactly these four:
   - `…/auth/googlehealth.activity_and_fitness.readonly`
   - `…/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `…/auth/googlehealth.sleep.readonly`
   - `…/auth/googlehealth.profile.readonly`
   → Save.

## 3. OAuth client
6. **Clients → Create client → Web application**, name `pulse-local`.
7. **Authorized redirect URIs:** `http://localhost:3000/api/auth/google/callback` (add your HTTPS URL later when hosted).
8. Create → copy **Client ID** and **Client secret** into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   ```
   Never paste these into chat, commits or screenshots.

## 4. Connect & probe
9. `npm run dev` → http://localhost:3000 → log in → **Settings → Connect Google Health**. Google warns “Google hasn’t verified this app”. That is expected for your own unverified app: click *Continue*, grant all four scopes.
10. The initial import (365 days) starts in the background. Watch Settings → Data streams.
11. In a second terminal: `npm run probe:google` (and `npm run probe:google -- 14`). It writes `probe-output/google-<date>.json` with **structure only** (no values). Tell me the console output (or share that file — it contains no health values).

## 5. The 7-day token problem
While the consent screen is in **Testing**, Google expires refresh tokens after **7 days** and the app will show “Reconnect needed”. To avoid this:
- **Audience → Publish app → In production.** For an unverified app under 100 users you should get a warning but no review. **Unverified for these scopes:** if Google demands verification, stay in Testing and reconnect weekly (one click). Report back which happened.

## 6. Hevy
12. Requires **Hevy Pro**. On https://hevy.com → Settings → **Developer** → generate an API key.
13. Settings in the app → paste key → **Connect** (validated against Hevy, stored encrypted). Then `npm run probe:hevy`.

## 7. Manual test: Fitbit heart rate *inside* Hevy
1. Google Health app → Fitbit Air → Connections → **Share heart rate** → on (“Always visible” if offered).
2. Hevy → Profile → Settings → Integrations → **Wearable Sensor** → select the Air.
3. Start an empty workout: does live HR appear under **Finish**? After finishing, is average HR in the summary?
4. Report: works / pairs but no data / not found. Also check whether the Google Health app still syncs afterwards.
