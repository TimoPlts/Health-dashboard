# Baseline iOS feasibility app

A minimal Capacitor 8 app that proves, **on your own iPhone and for €0**, what a standalone Baseline needs. It is a test harness, not the Baseline UI. It shows statuses and counts only. Plan: [docs/IOS_NATIVE_PLAN.md](../docs/IOS_NATIVE_PLAN.md).

| Card | Question it answers |
|---|---|
| 1 Installed via SideStore | Can a free Apple ID install an IPA built for free on GitHub? What bundle ID does SideStore give it? |
| 2 Local SQLite | Does the database survive relaunches and **updates**? How fast is one day of 3-s heart rate (insert, aggregate, read back)? |
| 3 Keychain | Does a Keychain value survive the 7-day re-sign and updates? |
| 4 Native HTTP | Can the app reach Google's API without CORS? |
| 5 Google OAuth | Does an **iOS OAuth client** (PKCE, **no client secret**) get the Health scopes, and can it refresh tokens and call the Health API? |
| 6 Background refresh | Does iOS run a `BGAppRefreshTask` for a sideloaded app? |
| 7 HealthKit | Does a free Apple ID allow the HealthKit entitlement? (only in the `-HealthKit` IPA) |

## Build (no Mac needed)
Every push to `ios-feasibility` that touches `ios-poc/` runs **Actions → iOS feasibility build** on GitHub's free macOS runner. Download the artifact `baseline-poc-<run>`; it contains `Baseline-POC-<run>.ipa` and `Baseline-POC-HealthKit-<run>.ipa`.

## Test protocol
1. **Install SideStore** (once, from Windows): follow the [SideStore install guide](https://docs.sidestore.io/docs/installation/install).
   - Install iTunes (Microsoft Store) and [iloader](https://github.com/nab138/iloader/releases).
   - Connect the iPhone by USB → iloader → sign in with your Apple ID → **Install SideStore**.
   - On the iPhone:
     - Settings → General → VPN & Device Management → trust your Apple ID.
     - Settings → Privacy & Security → **Developer Mode** on (restart).
     - Install **LocalDevVPN** from the App Store and connect it.
     - Open SideStore and sign in.
2. **Install the POC:** copy `Baseline-POC-<run>.ipa` to the iPhone (Files, iCloud Drive or AirDrop) → SideStore → My Apps → **+** → choose the IPA. Open it. Cards 1, 2 and 4 should pass.
3. **Google (card 5):**
   - Google Cloud console, **the same Personal-mode project** as the web app → Google Auth Platform → Clients → **Create client → iOS** → bundle ID `app.baseline.poc` → Create. It has no secret.
   - Then, in a terminal in the repo: `gh variable set GOOGLE_IOS_CLIENT_ID` and paste the client ID. It is not a secret, but this keeps it out of the code.
   - Re-run the workflow, install the new IPA over the old one (this is also the **update test**: card 2 should say "Updated from build …: data kept"), and tap **Connect Google**.
4. **Persistence:** close and reopen the app (card 2: launches + 1; card 3: PASS).
5. **7-day re-sign:** in SideStore, tap the "7 DAYS" counter of Baseline POC to refresh now, then reopen the POC (cards 2 and 3 must still pass).
6. **Background (card 6):** leave Background App Refresh on, use the phone normally for a day, then reopen.
7. **HealthKit (card 7, optional):** install `Baseline-POC-HealthKit-<run>.ipa` over the POC. Either SideStore refuses (no HealthKit on free accounts), or the app asks for Health access (supported). Both answers are useful.

Report the card statuses (screenshots are fine; they contain no health values).
