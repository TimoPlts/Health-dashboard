# API & platform research

Research date: **2026-11-26**. Sources are official documentation unless marked otherwise.
Statements are tagged **[doc]** (official docs), **[3p]** (third-party/vendor claim), **[verified]** (tested by us against real data) or **[unverified]**.
Nothing in this file has yet been verified against the owner's real accounts — see `PROJECT_STATUS.md`.

---

## 1. Google Health API (Fitbit Air data)

### 1.1 Status of the legacy Fitbit Web API — **dead**
- Support ended 30 Sep 2026; API + OAuth endpoints were **switched off on 2 Nov 2026** **[doc]** ([migration guide](https://developers.google.com/health/migration/api-specifications), [data access](https://developers.google.com/health/migration/data-access)).
- Consequence: any tutorial/library targeting `api.fitbit.com` is obsolete. This project targets only the **Google Health API v4**.

### 1.2 Fitbit Air compatibility
- Fitbit Air (launched May 2026, screenless, $99) syncs through the **Google Health** phone app (which replaced the Fitbit app) **[3p: Google blog / press]** ([blog.google](https://blog.google/products-and-platforms/devices/fitbit/fitbit-air/)).
- Fitbit Air appears in the API's compatible-device lists **[doc]**. It is not a data type — data arrives as `dataSource.device.formFactor = FITNESS_BAND` with `platform = FITBIT` **[doc, unverified for Air]**.
- **Prerequisite:** the Google account must be *linked* by signing in to the Google Health mobile app before OAuth consent; otherwise calls return `400 ACCOUNT_NOT_LINKED` **[doc]**. Verify with `GET /v4/users/me/identity`.

### 1.3 Endpoints **[doc]** ([reference](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints))
Base: `https://health.googleapis.com/v4`

| Method | HTTP | Use |
|---|---|---|
| `list` | `GET users/me/dataTypes/{type}/dataPoints` | raw points, keeps `dataSource` provenance |
| `reconcile` | `GET …/dataPoints:reconcile` | merges sources into one stream; excludes off-wrist intervals; **no `dataSource`** in results |
| `rollUp` | `POST …/dataPoints:rollUp` | fixed windows (≥1 s); max range 14 d (HR, total-calories, active-minutes, calories-in-HR-zone) else 90 d |
| `dailyRollUp` | `POST …/dataPoints:dailyRollUp` | civil-day buckets; also returns `restingHeartRatePersonalRange`, `heartRateVariabilityPersonalRange` |
| `get`, `create`, `patch`, `batchDelete`, `exportExerciseTcx` | | not used (read-only app) |

- `pageSize` default 1440, max 10 000; **sleep & exercise max 25**. `nextPageToken` pagination. Results newest-first.
- `filter` (AIP-160): `heartRate.sample_time.physical_time >= "…Z"`, `steps.interval.start_time`, `sleep.interval.end_time`, `dailyRestingHeartRate.date >= "YYYY-MM-DD"`; civil variants exist. **[doc; exact syntax unverified — first thing the probe checks]**
- `dataSourceFamily`: `all-sources` (default) | `google-wearables` | `google-sources` | `self-sources`. Not supported by `list` for sleep.

### 1.4 Data types relevant to this app **[doc]**
| Category | Types (kebab-case) | Kind | Storage resolution |
|---|---|---|---|
| Heart | `heart-rate` | sample (bpm, motionContext, sensorLocation) | **1 s storage** (actual Air sampling rate unknown) |
| | `heart-rate-variability` | sample: rMSSD, SDNN, LF/HF power | — |
| | `daily-resting-heart-rate` | daily, `calculationMethod` WITH_SLEEP / ONLY_WITH_AWAKE_DATA | day |
| | `daily-heart-rate-variability` | daily avg rMSSD, deep-sleep rMSSD, non-REM HR, entropy | day |
| | `daily-heart-rate-zones` | LIGHT/MODERATE/VIGOROUS/PEAK bpm bounds (**Karvonen-based**) | day |
| | `time-in-heart-rate-zone`, `active-zone-minutes` | interval | 1 min |
| Sleep | `sleep` | session: stages (AWAKE/LIGHT/DEEP/REM or classic ASLEEP/RESTLESS), short awakenings, out-of-bed, summary (minutesAsleep/Awake/ToFallAsleep…), `nap`, `mainSleep`, `stagesStatus` | session |
| Overnight vitals | `oxygen-saturation` (minute), `daily-oxygen-saturation`, `respiratory-rate-sleep-summary` (per stage), `daily-respiratory-rate`, `daily-sleep-temperature-derivations` (nightly, baseline, 30-d SD) | | |
| Activity | `steps`, `distance`, `floors`, `altitude`, `active-energy-burned`, `basal-energy-burned`, `active-minutes`, `activity-level`, `sedentary-period` | interval | 1 min |
| Fitness | `exercise` (type, activeDuration, metricsSummary: calories, avg HR, HR-zone durations, AZM, distance, splits), `vo2-max`, `daily-vo2-max` (cardioFitnessLevel), `run-vo2-max` | | |
| Body | `weight` (grams), `body-fat`, `height` | sample | |
| Other | ECG, IRN, nutrition, hydration, glucose, core temperature | | not used now |

- **Not exposed anywhere in the API:** Fitbit **Sleep Score**, **Daily Readiness**, cardio load / target load, stress / EDA score **[doc — searched all pages read; absence is the finding]**. `total-calories` exists only as a rollup value.

### 1.5 OAuth **[doc]** ([scopes](https://developers.google.com/health/scopes), [setup](https://developers.google.com/health/setup))
- Standard Google OAuth 2.0: `accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/token`; `access_type=offline` for refresh tokens; **access token lifetime 1 h**.
- Scopes used (read-only): `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.sleep.readonly`, `googlehealth.profile.readonly`.
- **Consent screen “Testing” status → refresh tokens expire after 7 days.** “In production” → refresh tokens persist (until revoked / 6 months unused).
- Unverified apps: capped at 100 users. >100 users requires a third-party security review. A single-user app stays far below.
- Sensitive/restricted classification of the `googlehealth.*` scopes: **not stated** in docs read **[unverified]**. Plan: publish the consent screen to *In production* while unverified and accept the “unverified app” warning. If Google blocks that for these scopes, fall back to Testing mode and re-consent weekly (app detects `invalid_grant` and shows “Reconnect”).
- No allow-list / application form found **[doc]**.

### 1.6 Quotas **[doc]** ([rate limits](https://developers.google.com/health/rate-limits))
300 requests/min per user; 120 000/min and 86.4 M/day per project. Exceeding → `429 RESOURCE_EXHAUSTED`. Retry 429/503/504 with exponential backoff + jitter. We self-throttle to 4 req/s.

### 1.7 Webhooks **[doc]** ([webhooks](https://developers.google.com/health/webhooks))
Supported (subscribers + subscriptions per data type, signed POSTs, UPSERT/DELETE notifications, best effort, 24 h retention). Requires a **public HTTPS endpoint** and a service account. **Decision:** not used in v1 (local-first). Polling with a lookback window instead; revisit once hosted (see ADR-0003).

### 1.8 Historical data
No documented look-back limit for `list`/`reconcile` **[doc summary; unverified]**. Default backfill: 365 days (`BACKFILL_DAYS`). Your history depends on what Google migrated from the Fitbit app.

### 1.9 Fitbit Air as a Bluetooth HR sensor **[3p]**
- Google Health app → device → Connections → **“Share heart rate”** makes the Air broadcast the standard **Bluetooth SIG Heart Rate Profile** ([Yahoo Tech](https://tech.yahoo.com/wearables/articles/7-first-things-google-fitbit-225212773.html), [FITIV](https://www.fitiv.com/blog/fitbit-air-live-heart-rate), [HeartCast](https://www.heartcast.app/heartcast-adds-support-for-google-fitbit-air-and-all-external-bluetooth-heart-rate-monitors/)). A review reports it works with “some devices, but not all” ([the5krunner](https://the5krunner.com/2026/05/07/fitbit-air-opinion-review-buyers-guide/)).
- A community project reads Air HR over BLE ([GitHub](https://github.com/AyushSagar16/fitbit-air)).

---

## 2. Hevy API

Source: the official OpenAPI spec at `https://developers.hevy.com/openapi.json` (docs UI at developers.hevy.com/docs, formerly api.hevyapp.com/docs) **[doc]**.

- Base `https://api.hevyapp.com`, header **`api-key: <uuid>`**. The spec also declares a bearer/OAuth scheme, not documented for personal use.
- **Hevy Pro required** for the API **[3p; `user/info.is_pro` doc]**. Key: hevy.com → Settings → Developer.
- Endpoints: `GET /v1/workouts` (pageSize ≤ 10), `/v1/workouts/count`, **`/v1/workouts/events?since=`** (updated / deleted events, newest first: the incremental-sync mechanism), `/v1/workouts/{id}`, `/v1/exercise_templates` (pageSize ≤ 100), `/v1/exercise_history/{templateId}`, `/v1/routines`, `/v1/routine_folders`, `/v1/body_measurements`, `/v1/user/info`. Write endpoints exist (POST/PUT workouts, routines, templates, measurements); this app does not use them.
- Workout: `id, title, routine_id, description, start_time, end_time (ISO-8601 UTC), created_at, updated_at, media[], exercises[]{index, title, notes, exercise_template_id, superset_id, sets[]{index, type: normal|warmup|dropset|failure, weight_kg, reps, distance_meters, duration_seconds, rpe, custom_metric}}`.
- Template: `id, title, type, primary_muscle_group, secondary_muscle_groups[], equipment, is_custom`.
- **No heart-rate or calorie fields** anywhere in the public API, read or write. **No webhooks** in the spec. **No documented rate limits** (we throttle to 2 req/s and back off on 429).

### 2.1 Fitbit heart rate *inside* Hevy (requirement 2)
- Hevy officially supports **BLE heart-rate sensors during live workouts** (Profile → Settings → Integrations → Wearable Sensor). Live HR shows under the Finish button; the summary shows average HR. Fitbit is among the listed brands **[doc: Hevy feature page](https://www.hevyapp.com/features/hevy-heart-rate/)**.
- Combined with the Air’s standard BLE HR broadcast, **Fitbit HR in Hevy should work with zero code from us** **[unverified — needs a manual test on your iPhone]**. Risks: some receivers reportedly fail to pair; iOS may restrict concurrent BLE use while the Google Health app holds the connection.
- Writing HR *into* Hevy through the API is **impossible** (no field).
- Building our own BLE relay is not useful: the Air already speaks the standard profile, and a PWA cannot do BLE on iOS anyway.

---

## 3. iPhone / platform choice

| Option | HealthKit | BLE | Background | Install from Windows | Cost |
|---|---|---|---|---|---|
| **PWA (installed to Home Screen)** | ✗ | ✗ (no Web Bluetooth in iOS Safari) | ✗ on device; web push allowed since iOS 16.4 | Safari → Share → Add to Home Screen | free |
| Capacitor / Expo (React Native) | ✓ (plugin) | ✓ | limited (BGTaskScheduler) | EAS cloud build from Windows; device install needs signing | **Apple Developer $99/yr** (free Personal Team builds expire after 7 days and need a Mac/Xcode) |
| Native Swift | ✓ | ✓ | limited | needs a Mac | $99/yr |

**Finding:** every required data source is a *cloud* REST API (Google Health, Hevy). Neither HealthKit nor BLE is needed for the core product. **→ PWA + server is the right v1** (ADR-0001). A native shell can be added later for live BLE HR or HealthKit without touching the data/analytics core.

## 4. Other apps — public methodology (summary; detail in METRIC_INVENTORY.md)
- **WHOOP** recovery (HRV, RHR, sleep, resp. rate) and strain (0–21, log-scaled cardiovascular load): proprietary, weights unpublished.
- **Bevel**, **Athlytic**: proprietary recovery/strain clones built on Apple Health HRV/RHR; methods only described qualitatively.
- **Fitbit** Sleep Score (duration, quality, restoration), Daily Readiness (HRV, RHR, sleep, recent activity), Active Zone Minutes (minutes ×1 fat-burn, ×2 cardio/peak, Karvonen zones): AZM rules are public; the scores are proprietary and **not in the API**.
- **Garmin** Training Load (EPOC-based, Firstbeat), Body Battery: proprietary.
- **Apple** Cardio Fitness (VO₂max estimate), HRV (SDNN, not rMSSD): methods partially described in Apple white papers.
- **Hevy**: volume = Σ weight×reps; 1RM estimate shown in-app (formula not documented publicly).
- **MacroFactor**: adaptive TDEE from weight trend + intake (energy-balance back-calculation); relevant later for energy balance.
