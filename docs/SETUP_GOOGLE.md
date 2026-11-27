# Connecting Google Health and Hevy

Revalidated against official docs on 2026-11-26 ([setup](https://developers.google.com/health/setup), [audience](https://support.google.com/cloud/answer/15549945), [personal mode](https://support.google.com/cloud/answer/15544987), [restricted scopes](https://support.google.com/cloud/answer/13464325)).

## Key facts that shape the setup
- The `googlehealth.*` scopes are **restricted** scopes. An *External* app in production must complete OAuth verification for them. A *Testing* app works without verification, but its **refresh tokens expire after 7 days** (no exception for these scopes).
- **Personal mode** (Google Auth Platform user type “Personal”): only the Google account that *created* the OAuth app can authorize it. Google states that it needs **no verification, has no 7-day expiry and shows no unverified-app screen**. The choice is permanent for that project. Whether Google allows *restricted* Health scopes in Personal mode is **not documented**, so we test it (plan A). Plan B is External + Testing with a weekly one-click reconnect.
- The Google account must be **the same account** that is signed in to the Google Health app with your Fitbit Air (otherwise `ACCOUNT_NOT_LINKED`). A Google Workspace (school/work) account may be blocked by its admin, so use your personal Google account.
- Secrets never go into chat, Git, OneDrive or shell history. They are typed into hidden prompts by `npm run configure`, or imported from the client JSON file, which is then deleted. They are stored in `%LOCALAPPDATA%\Baseline\config.env`.

## Steps (the assistant guides you through them one at a time)
1. **App password:** in the VS Code terminal run `npm run configure -- password`, type a passphrase (hidden), then sign in at http://localhost:3000.
2. **Account check:** on your iPhone, Google Health app → profile: note which Google account is signed in. Use that account in the browser for the next steps.
3. **Plan A: Personal-mode project:** open https://console.cloud.google.com/auth/overview/personal while signed in as that account → *Create a new project* → Application type **Web application** → accept the terms → *Continue*.
4. **Enable the API** in that project: https://console.cloud.google.com/apis/library/health.googleapis.com → *Enable*.
5. **Redirect URI:** Google Auth Platform → *Clients* → the web client → *Authorized redirect URIs* → add `http://localhost:3000/api/auth/google/callback` → Save.
6. **Scopes:** Google Auth Platform → *Data Access* → *Add or remove scopes* → filter “Google Health API” → tick the four `.readonly` scopes: activity_and_fitness, health_metrics_and_measurements, sleep, profile → *Update* → *Save*.
7. **Client credentials:** on the client page click *Download JSON* (saved to `Downloads`, which is not OneDrive-synced). Then run `npm run configure -- google`: it imports `client_secret_*.json`, checks the redirect URI and deletes the file. Restart the app.
8. **Connect:** Baseline → Settings → *Connect Google Health* → choose the same account → allow. If Google refuses (restricted scopes not allowed in Personal mode), switch to Plan B.
9. **Probe** (the assistant runs it): `npm run probe:google`. The structure-only report goes to `%LOCALAPPDATA%\Baseline\probe-output`.

**Plan B (only if step 8 fails):** create a normal project → Google Auth Platform → Branding (app name *Baseline*, your email) → Audience: **External**, status **Testing**, add yourself as test user → then steps 4–8. Reconnect weekly when Settings shows “Reconnect needed”.

## Hevy
10. Requires Hevy Pro. https://hevy.com/settings?developer → generate an API key → paste it into Baseline → Settings → Hevy (a password field: validated with Hevy, stored encrypted in the database, never shown again).

## Fitbit heart rate inside Hevy (separate investigation, no code involved)
Google Health app → Fitbit Air → Connections → **Share heart rate** on → Hevy → Profile → Settings → Integrations → **Wearable Sensor** → pick the Air → start an empty workout → does live HR appear under *Finish*? Baseline cannot write HR into Hevy: the Hevy API has no such field.
