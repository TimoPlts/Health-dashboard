# Product spec

**Pulse** is a private, single-user health & training app that combines Fitbit Air data (Google Health API) with Hevy strength workouts in a premium, iPhone-first interface. It has no AI coaching, social features, ads or subscriptions.

## Goals
1. Replace day-to-day use of Google Health / Bevel for *looking at* data. The Google Health app keeps running in the background for device sync.
2. Accurate data with explicit provenance and documented calculations.
3. Every Hevy workout gets heart-rate analytics from the Fitbit Air.
4. Excellent mobile UX: installable, fast, readable, honest charts.

## Non-goals (v1)
AI insights, chat, social, food logging, multi-user, writing data back to providers.

## Navigation (current → target)
- **Today**: last night’s sleep, overnight vitals, activity, recent workouts, sync status. ✅
- **Training**: Hevy history with HR. Workout detail with HR timeline, zones, recovery, sets, e1RM, comparison. ✅ Strength progression, muscle volume, load: 🟡
- **Settings**: connections, stream status, manual sync, logout. ✅ Units, theme, goals, zones, export, delete: 🟡
- **Sleep**, **Health** (vitals & baselines), **Trends** (7 d … all time): 🟡 Phases 4–6. They are added to the tab bar only when they show real data.

## Requirements: Fitbit HR in Hevy
1. *In this app*: ✅ implemented by timestamp matching (needs real-data verification).
2. *Inside Hevy itself*: expected to work natively via the Air’s BLE “Share heart rate” plus Hevy’s Wearable Sensor integration. **Unverified**, needs a manual test (see PROJECT_STATUS).
