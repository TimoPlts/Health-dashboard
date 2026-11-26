# Metric inventory & availability matrix

Legend: **M** directly measured by a sensor · **E** wearable/provider estimate · **API** retrievable via API · **D** derived by us from other data · **HW** needs extra hardware · **P** proprietary & unavailable · **R** reproducible from published methods.
Status: ✅ implemented (fictional-data tested) · ✅✅ verified against the owner's real Fitbit Air data · 🟡 planned · ⛔ unavailable · ❔ unknown.

## Observed on the real account (Fitbit Air + iPhone, probed and synced 2026-11-26)
Structure/consistency only; no values are recorded in the repo. Re-run with `npm run probe:google -- 3 --history` and `npm run verify:google`.
"OK, empty" = valid HTTP 200 response with no data points in the window (not an error).

| Stream | Method | Result | Source(s) seen | Notes |
|---|---|---|---|---|
| heart-rate | list, google-wearables | ✅✅ data | Fitbit Air, PASSIVELY_MEASURED | **3 s** median interval (p10 1 s, p99 3 s); ~17–34 k samples/day; history from 2026-11-24 (Air first worn). No `motionContext` in Air data. Daily min/avg/max of stored samples = Google's `dailyRollUp` exactly. |
| heart-rate (dailyRollUp) | dailyRollUp | ✅✅ data | — | provider daily min/avg/max |
| heart-rate-variability | list, google-wearables | ✅✅ data | Fitbit Air, DERIVED | rMSSD + `metadata.lowFrequencyPower/highFrequencyPower`; no SDNN field |
| oxygen-saturation | list, google-wearables | ✅✅ data | Fitbit Air | per-minute samples during sleep |
| respiratory-rate-sleep-summary | list | ✅✅ data | Fitbit Air | full/deep/light/REM breaths/min, SNR, SD |
| sleep | reconcile | ✅✅ data | merged | STAGES type, ~28 stages/night, `shortAwakenings`; Σ non-awake stages = `minutesAsleep` exactly |
| exercise | list (all sources) | ✅✅ data | Fitbit Air (auto + started on device), **Hevy via Apple Health** | every Hevy workout also appears as a HealthKit session; both kept with provenance, Fitbit preferred for display |
| steps, distance | reconcile | ✅✅ data | merged (Air + iPhone) | Σ reconcile per day = `dailyRollUp` exactly; raw list would over-count by up to 56 %. iPhone history from 2026-10-25 |
| active-energy-burned | reconcile | ✅✅ data | merged (Air, iPhone, Hevy) | raw list over-counts up to 100 % |
| basal-energy-burned | reconcile | OK, empty | — | never populated for this account → total uses `total-calories` |
| total-calories | dailyRollUp | ✅✅ data | — | rollup-only type |
| calories-in-heart-rate-zone | dailyRollUp | ✅✅ data | — | rollup-only; light/moderate/vigorous/peak |
| active-zone-minutes | reconcile | ✅✅ data | merged | per-minute, FAT_BURN/CARDIO/PEAK |
| active-minutes, activity-level, time-in-heart-rate-zone | reconcile | ✅✅ data | merged | per-minute classification |
| sedentary-period | reconcile | ✅✅ data | merged | |
| floors | reconcile | ✅✅ data | merged (no `list` method → origin unknown; the iPhone also counts floors) | |
| altitude | reconcile | OK, empty | — | |
| swim-lengths-data | reconcile | ✅✅ data | Fitbit Air, PASSIVELY_MEASURED | stroke counts; owner to confirm these were real swims |
| daily-resting-heart-rate, daily-heart-rate-variability, daily-oxygen-saturation, daily-respiratory-rate, daily-sleep-temperature-derivations, daily-heart-rate-zones | list | ✅✅ data | Fitbit Air | one point per day/night |
| daily-vo2-max, vo2-max, run-vo2-max | list | OK, empty | — | Air has no GPS; may appear after outdoor runs |
| weight, height | list | ✅✅ data | Fitbit app, MANUAL | |
| body-fat, blood-glucose, core-body-temperature | list | OK, empty | — | no source device |
| skin-temperature-sensors | v4beta only | OK, empty | — | not synced (beta API) |
| electrocardiogram, irregular-rhythm-notification | — | ⛔ | — | separate scopes; Air has no ECG |
| hydration-log, nutrition-log, food | — | 🟡 | — | needs the nutrition scope (not requested) |

## Heart & cardiovascular
| Metric | Class | Source / method | Status |
|---|---|---|---|
| Heart rate (intraday) | M · API | `heart-rate` samples, **3 s** on the Air | ✅✅ |
| Resting HR | E · API | `daily-resting-heart-rate` (provider original) | ✅ |
| Avg / min / max HR per window | D | time-weighted, gap-aware (CALCULATIONS HR-STATS) | ✅ |
| Sleeping HR / non-REM HR | E · API | `daily-heart-rate-variability.nonRemHeartRateBeatsPerMinute` | ✅ stored, 🟡 UI |
| HRV (rMSSD) daily / deep sleep | E · API | `daily-heart-rate-variability` | ✅ |
| HRV samples, SDNN, LF/HF | E · API | `heart-rate-variability` | ✅ stored |
| HRV baseline & deviation | D · R | 28-day ln(rMSSD) mean±SD, z-score (Plews 2013) | ✅ lib, 🟡 UI |
| Daily HR min/avg/max (provider) | E · API | `heart-rate` dailyRollUp | ✅✅ |
| HR recovery (1/2 min) | D · R | drop after workout end; requires samples ±10 s | ✅ |
| HR zones (provider) | E · API | `daily-heart-rate-zones` (Karvonen) | ✅ |
| HR zones (custom HRR) | D · R | Karvonen 5-zone, user HRmax | ✅ lib, 🟡 settings |
| Time in zones | D / API | our gap-aware calc + `time-in-heart-rate-zone` | ✅ |
| Respiratory rate | E · API | `daily-respiratory-rate`, per-stage summary | ✅ |
| SpO₂ | M/E · API | `daily-oxygen-saturation`, minute samples | ✅ |
| Skin temperature variation | M/E · API | `daily-sleep-temperature-derivations` (nightly − baseline) | ✅ |
| VO₂ max / cardio fitness level | E · API | `daily-vo2-max`, `vo2-max`, `run-vo2-max` | ✅ synced; empty so far on the Air |
| ECG, irregular rhythm | M · API | needs a Pixel Watch, not available on the Air | ⛔ HW |

## Recovery & readiness
| Metric | Class | Status |
|---|---|---|
| Fitbit Daily Readiness score | P | ⛔ not in API |
| WHOOP / Bevel / Athlytic recovery | P | ⛔ proprietary |
| **App recovery index** (HRV z, RHR z, sleep vs need, prior load) | D · app-specific, labelled as such | 🟡 Phase 6 |
| HRV / RHR deviation from baseline | D · R | ✅ lib |
| Acute / chronic load, training balance | D · R (EWMA, Williams 2017) | ✅ lib, 🟡 UI |
| Accumulated fatigue | D | 🟡 (ACWR-style, labelled heuristic) |

## Sleep
| Metric | Class | Status |
|---|---|---|
| Fitbit Sleep Score | P | ⛔ not in API |
| Total sleep, awake, latency, stages, stage timeline | E · API | ✅ |
| Time in bed, onset, wake time | API | ✅ |
| Sleep efficiency | D · R (TST / TIB) | ✅ |
| Interruptions | API (`shortAwakenings`, AWAKE stage count) | 🟡 UI |
| Sleep consistency | D · R (Sleep Regularity Index, Phillips 2017) | 🟡 |
| Sleep debt / need | D · app-specific (rolling need vs. obtained) | 🟡, labelled estimate |
| Naps | API (`metadata.nap`) | ✅ stored |

## Activity & energy
| Metric | Class | Status |
|---|---|---|
| Steps, distance, floors | M/E · API | ✅✅ (reconciled across Air + iPhone; floors present) |
| Active minutes / activity level / sedentary | E · API | ✅ stored |
| Active Zone Minutes | E · API (public rules) | ✅ |
| Active / total energy | **E** · API, always labelled “est.” | ✅✅ total from `total-calories` rollup; basal not provided |
| Calories per HR zone | E · API (`calories-in-heart-rate-zone` rollup) | ✅✅ stored, 🟡 UI |
| Swim lengths / strokes | E · API | ✅✅ stored, 🟡 UI |
| Exercise sessions (auto-detected) | E · API | ✅ stored, shown for overlap only |
| Activity goals | settings | 🟡 (step goal hard-coded 10 000 for now) |

## Training (Hevy)
| Metric | Class | Status |
|---|---|---|
| Workouts, exercises, sets, reps, weight, RPE, duration | API (Hevy) | ✅ |
| Volume load (total / exercise) | D · R | ✅ |
| Estimated 1RM (Epley; Brzycki alt.) | D · R | ✅ |
| Sets per muscle group (primary 1, secondary 0.5) | D · app convention | ✅ lib, 🟡 UI |
| PRs, progression, frequency, consistency | D | 🟡 Phase 5 |
| Workout HR (avg/min/max/timeline/zones/recovery) | D (Google HR × Hevy interval) | ✅ |
| Workout calories | E · Google exercise session if overlapping, else 🟡 HR-based (Keytel 2005) labelled estimate | partial |
| TRIMP (Banister) per workout / day | D · R | ✅ lib, 🟡 UI |
| WHOOP strain / Garmin load | P | ⛔ (our TRIMP-based load is shown instead, never named “strain”) |

## Body & nutrition (secondary)
| Metric | Class | Status |
|---|---|---|
| Weight, body fat | API (Google, Hevy body measurements) | ✅ Google stored, 🟡 Hevy |
| BMI | D (weight / height²) | 🟡 |
| Lean mass | API (Hevy) or D | 🟡 |
| Intake / macros | API (Google nutrition scope) or manual | 🟡 later |
| Energy balance | D, estimate | 🟡 later |
