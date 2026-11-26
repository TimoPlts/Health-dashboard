# Metric inventory & availability matrix

Legend: **M** directly measured by a sensor · **E** wearable/provider estimate · **API** retrievable via API · **D** derived by us from other data · **HW** needs extra hardware · **P** proprietary & unavailable · **R** reproducible from published methods.
Status: ✅ implemented (fictional-data tested) · 🟡 planned · ⛔ unavailable · ❔ depends on real-data probe.

## Heart & cardiovascular
| Metric | Class | Source / method | Status |
|---|---|---|---|
| Heart rate (intraday) | M · API | `heart-rate` samples (1 s storage; Air rate ❔) | ✅ |
| Resting HR | E · API | `daily-resting-heart-rate` (provider original) | ✅ |
| Avg / min / max HR per window | D | time-weighted, gap-aware (CALCULATIONS HR-STATS) | ✅ |
| Sleeping HR / non-REM HR | E · API | `daily-heart-rate-variability.nonRemHeartRateBeatsPerMinute` | ✅ stored, 🟡 UI |
| HRV (rMSSD) daily / deep sleep | E · API | `daily-heart-rate-variability` | ✅ |
| HRV samples, SDNN, LF/HF | E · API | `heart-rate-variability` | ✅ stored |
| HRV baseline & deviation | D · R | 28-day ln(rMSSD) mean±SD, z-score (Plews 2013) | ✅ lib, 🟡 UI |
| Google personal RHR/HRV range | E · API | `dailyRollUp` personal ranges | 🟡 |
| HR recovery (1/2 min) | D · R | drop after workout end; requires samples ±10 s | ✅ |
| HR zones (provider) | E · API | `daily-heart-rate-zones` (Karvonen) | ✅ |
| HR zones (custom HRR) | D · R | Karvonen 5-zone, user HRmax | ✅ lib, 🟡 settings |
| Time in zones | D / API | our gap-aware calc + `time-in-heart-rate-zone` | ✅ |
| Respiratory rate | E · API | `daily-respiratory-rate`, per-stage summary | ✅ |
| SpO₂ | M/E · API | `daily-oxygen-saturation`, minute samples | ✅ |
| Skin temperature variation | M/E · API | `daily-sleep-temperature-derivations` (nightly − baseline) | ✅ |
| VO₂ max / cardio fitness level | E · API | `daily-vo2-max`, `vo2-max` | ✅ stored, 🟡 UI ❔ (Air has no GPS; may be absent) |
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
| Steps, distance, floors | M/E · API | ✅ (floors ❔: the Air may lack a barometer) |
| Active minutes / activity level / sedentary | E · API | ✅ stored |
| Active Zone Minutes | E · API (public rules) | ✅ |
| Active / basal / total energy | **E** · API, always labelled “est.” | ✅ |
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
