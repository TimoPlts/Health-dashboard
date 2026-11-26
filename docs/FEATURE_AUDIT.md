# Feature & calculation audit

_2026-11-26 · against [PRODUCT_SPEC](PRODUCT_SPEC.md), the owner's real Google Health data, and the current public feature sets of Google Health, Bevel, WHOOP, Athlytic and Apple Fitness._

Competitor features come from vendor pages, App Store listings and press coverage (sources at the end). They are indicative, not independently tested. Baseline adds no AI features, so AI coaches (Google Health Coach, WHOOP Coach, Bevel AI, Ask Athlytic) are out of scope by design.

**Legend**
- Baseline status:
  - ✅ supported
  - 🟡 partial
  - 🧮 missing, but can be calculated from data Baseline already has
  - ❌ missing; needs new input (manual entry or another source)
  - ⛔ technically unavailable
- Other apps: ● has the feature · ○ does not.

## 1. Feature comparison

### Recovery, readiness, strain
| Feature | Google Health | Bevel | WHOOP | Athlytic | Apple Fitness | Baseline |
|---|---|---|---|---|---|---|
| Daily recovery / readiness score | ● Readiness | ● Recovery | ● Recovery | ● Recovery | ● readiness (reported) | ✅ Recovery (percentile vs own baseline) + categorical readiness; calibrating until 14 HRV nights |
| HRV & resting HR vs personal baseline | ● | ● | ● | ● | ● Vitals | ✅ 28-day baseline band on every vital |
| Daily strain / exertion | ● cardio load | ● Strain | ● Strain 0–21 | ● Exertion | ● Effort | ✅ Cardio load (Edwards TRIMP); deliberately not on a 0–21 scale |
| Strain target for today | ● weekly target | ● | ● | ● | ○ | 🧮 load range that keeps ACWR within 0.8–1.3 (roadmap R3) |
| Acute vs chronic load | ○ | ● | ○ | ● | ● 7 vs 28 d | ✅ ACWR + training balance (calibrating until 21 tracked days) |
| Fatigue / illness signals | ○ | ○ | ● | ○ | ● Vitals outliers | ✅ independent flags (HRV, RHR, load, sleep debt, skin temp, breathing rate) |
| Stress score / EDA | ● (device-dependent) | ● | ● 0–3 | ● | ○ | ⛔ no stress or EDA data type in the Google Health API |
| "Energy bank" / body battery | ○ | ● | ○ | ○ | ○ | ⛔ by policy: proprietary blend with no published method; would be an invented formula |
| Biological age / pace of aging | ○ | ● | ● | ○ | ○ | ⛔ by policy: no validated method from wearable-only inputs |

### Sleep
| Feature | Google Health | Bevel | WHOOP | Athlytic | Apple Fitness | Baseline |
|---|---|---|---|---|---|---|
| Sleep score | ● | ● | ● | ● | ● | ✅ own documented score; the Fitbit score is not in the API (⛔) |
| Stages, hypnogram | ● | ● | ● | ● | ● | ✅ |
| Sleep need & debt | ○ | ● | ● | ● | ○ | ✅ need = setting (default 8 h); debt over 7 nights |
| Consistency / regularity | ● | ● | ● | ○ | ○ | ✅ SRI (Phillips 2017) + midpoint variability |
| Bedtime / wake target | ● schedule | ● | ● | ● | ○ | 🧮 from sleep need + usual wake time (roadmap R4) |
| Smart alarm | ● (device) | ● | ● | ○ | ○ | ⛔ needs the wearable to vibrate |
| Overnight breathing rate, SpO₂, skin temperature | ● | ● | ● | ● | ● | ✅ incl. **new**: breathing rate per sleep stage, SpO₂ low end |
| Naps | ● | ● | ● | ○ | ● | 🟡 stored and kept separate from the main night; not yet shown |

### Workouts & cardio
| Feature | Google Health | Bevel | WHOOP | Athlytic | Apple Fitness | Baseline |
|---|---|---|---|---|---|---|
| Workout list & detail with HR timeline | ● | ● | ● | ● | ● | ✅ from Google sessions; Fitbit + Hevy duplicates merged |
| HR zones per workout | ● | ● | ● | ● | ● | ✅ Google zones and %HRmax zones, both labelled |
| HR recovery after workout | ○ | ○ | ○ | ● | ● (cardio recovery) | ✅ HRR60/120 |
| Comparison with similar workouts | ○ | ● | ● | ● | ● | ✅ |
| Exclude false detections | ○ | ○ | ○ | ○ | ○ | ✅ (non-destructive) |
| Manual workout labels / effort rating | ● | ● | ● | ● | ● effort 1–10 | ❌ planned (roadmap R1) |
| Zone 2 tracking | ○ | ● | ● | ● | ○ | 🟡 daily Zone 2 minutes; no weekly target or dedicated view (roadmap R3) |
| VO₂ max / cardio fitness | ● | ● | ● | ● | ● | 🟡 wired up; **the Air writes no VO₂ max for this account** (empty stream) |
| Strength detail (sets, reps, volume, 1RM) | ○ | ● | ● (estimated) | ○ | ○ | ⛔ without Hevy Pro: Hevy's Apple Health entries carry no sets (ADR-0005) |
| Live heart rate during a workout | ● (device) | ● | ● | ● | ● | ⛔ in a web app; needs BLE in a native app (roadmap R12) |

### Activity & body
| Feature | Google Health | Bevel | WHOOP | Athlytic | Apple Fitness | Baseline |
|---|---|---|---|---|---|---|
| Steps, distance, floors, energy | ● | ● | ● | ● | ● | ✅ (Google estimates labelled) |
| Active Zone Minutes | ● | ○ | ○ | ○ | ○ | ✅ incl. **new**: AZM per zone (fat-burn / cardio / peak) |
| Activity by intensity | ● | ● | ○ | ○ | ● | ✅ **new**: light / moderate / vigorous minutes |
| Daily goals / rings | ● | ● | ○ | ● | ● | ❌ planned (roadmap R8) |
| Weekly AZM target (WHO 150 min) | ● | ○ | ○ | ○ | ○ | 🧮 (roadmap R3) |
| Weight & body composition trend | ● | ● | ● | ○ | ○ | 🟡 weight/body-fat pages exist; one weight entry so far; no smoothed trend (roadmap R5) |
| Nutrition, hydration, energy balance | ● | ● | ○ | ● | ○ | ❌ Google API has nutrition/hydration types, not yet synced (roadmap R10) |
| Habit journal & correlations | ○ | ● | ● | ○ | ○ | ❌ planned (roadmap R6, R7) |
| Weekly / monthly report | ● | ● | ● | ● | ○ | 🧮 all inputs exist (roadmap R2) |

### Cross-cutting
| Feature | Baseline |
|---|---|
| Every metric: detail page, ranges, scrubbable chart, baseline band, averages, min/max, period comparison, source & method | ✅ (68 metrics) |
| Customisable Today dashboard | ❌ fixed layout (roadmap R9) |
| Offline / installable on iPhone | 🟡 PWA manifest + icons exist; HTTPS deployment is this phase's milestone 2 |
| Export, backup/restore, delete-all | 🟡 CLI backup only; milestone 5 |

## 2. Google Health data and where it appears

All 35 streams are synced. After this audit, every stream with data for this account has at least one metric page, except:

| Data | Status | Reason |
|---|---|---|
| HRV samples (5-min rMSSD during sleep) | 🟡 stored, not charted | Nightly HRV (Google's own daily value) is shown. A per-night HRV curve is a candidate for the Sleep page (roadmap R4). |
| HRV LF / HF power | not shown, by decision | LF/HF from short wrist recordings is a contested index of "sympatho-vagal balance" (Billman 2013 Front Physiol 4:26). Shown nowhere, to avoid a misleading stress proxy. |
| SpO₂ per-minute samples | 🟡 used only via Google's nightly range | An overnight SpO₂ curve could be added; single-sample minima are not shown (motion artefacts). |
| Naps, short awakenings | 🟡 stored | No naps recorded yet; awakenings could be counted per night (roadmap R4). |
| Swim stroke type | 🟡 stored | Shown only as stroke count; the owner has to confirm that the detected swims are real. |
| Skin-temperature 30-day SD | 🟡 stored | Could widen the skin-temperature flag into a personal band; currently a fixed +1.0 °C. |
| `activity-level` (per-minute class) | not shown, by decision | Duplicates `active-minutes` + `sedentary-period`, which are shown. |
| Basal energy, altitude, VO₂ max, body fat, glucose, core temperature | empty for this account | Pages exist and fill in automatically if a source writes data. |
| Fitbit Sleep Score, Daily Readiness, cardio load target, stress | ⛔ | Not exposed by the Google Health API (API_RESEARCH §1.4). |

## 3. Calculation audit

Each method was checked for its formula, source, units, inputs, baseline period, missing-data behaviour and wording. Versions were bumped where results change. Details are in [CALCULATIONS](CALCULATIONS.md).

| Area | Finding | Change |
|---|---|---|
| **Acute/chronic load, training balance** | The current, incomplete day entered the acute EWMA, so ACWR dropped every morning. Days worn for only a few hours counted as tracked with artificially low load. | `acwr-ewma@2`: only complete days with ≥ 10 h HR coverage count (Troiano 2008 valid-day rule). Regression test. |
| **Daily totals** (steps, energy, minutes, load, sedentary) | Today's partial total was included in 7/30/90-day averages, min/max, comparisons and the baseline delta. | The current day is shown as "so far" and excluded from those statistics. Regression test. |
| **Recovery** | Without HRV, the score renormalised over RHR + sleep, so sleep duration carried 45 % while it was still called "recovery". | `recovery@2`: HRV required; calibrates on HRV nights. Regression test. |
| **Readiness** | Doc cited Javaloyes 2019 (flags HRV *above* the band too) but the code followed Kiviniemi 2007 (only *below*). The level expression was redundant. | Documented the choice with rationale; simplified the code (behaviour unchanged). Test for "above". |
| **Sleep regularity (SRI)** | Midnight-to-midnight windows compared each evening with the start of the night after next, even if that night was not recorded, which lowered SRI. | `sleep-sri@2`: noon-to-noon windows. Regression test. |
| **Sedentary time** | Aggregated as a mean metric although it is a daily total. | `agg: sum` (affects only today's handling). |
| **Heart-rate zones** | Doc said Tanaka 208 − 0.7·age is the default; the code uses 220 − age (verified to match Google). Karvonen Z1–Z5 documented but unused. | Doc corrected: two labelled zone systems (Google HRR zones; %HRmax zones for load). |
| **Zone 2** | Not stated that %HRmax Zone 2 is a convention, not a threshold-based zone. | Limitation documented. |
| **Cardio load (strain)** | Ring scaling undocumented; all-day load includes walking (Edwards Z1 ≥ 50 % HRmax). | Documented; Today shows "Load so far". |
| **Calorie expenditure** | No Baseline formula; values are Google's estimates. Error range undocumented. | ENERGY section with error range (Shcherbina 2017). |
| **Personal baselines** | 28 days, ≥ 14 values, previous days only, ln for HRV. Consistent everywhere. | No change. Calibration periods were **not** shortened. |
| **Sleep score, need, debt** | Weights are an app choice (documented). Need is a population default (labelled estimate). Debt needs ≥ 3 nights; flag needs ≥ 5. | No change. |
| **HR recovery** | Doc pointed to old code and to Hevy's "Finish" time. | Doc updated for Google sessions, including the cool-down caveat. |
| **Banister TRIMP, strength metrics** | Documented as if active; unused (no sex in profile; no Hevy sets). | Marked "not used" / "dormant". |
| **Newly exposed Google data** | Breathing rate per sleep stage, SpO₂ low end, activity by intensity, AZM by zone were stored but not shown. | 9 new metric pages. Night samples are attributed to the wake date (verified on real data). |

Not changed on purpose: the weights of recovery (45/30/25) and of the sleep score (50/20/15/15) are app choices with no validation study behind them. They are labelled as such rather than tuned, and will be reviewed against the owner's experience once calibrated (PROJECT_STATUS next action 3).

## 4. Product-spec check
| Spec goal | State |
|---|---|
| Replace day-to-day viewing of Google Health / Bevel | Data and pages are complete for viewing. Daily use on the iPhone depends on milestone 2–4 (HTTPS, install, auto-start). |
| Accurate data with provenance and documented calculations | ✅ every metric has source, method and missing-data rule |
| Heart-rate analytics for every workout | ✅ via Google sessions (Hevy out of scope) |
| Excellent mobile UX | ✅ on demo data; to be confirmed on the owner's iPhone in standalone mode |

## Sources
- Google Health app: [Google blog](https://blog.google/products-and-platforms/products/google-health/google-health-app/), [Google Health help](https://support.google.com/googlehealth/answer/17068213), [9to5Google](https://9to5google.com/2026/05/07/google-health-fitbit-features/), [heise](https://heise.de/-11304770)
- Bevel: [App Store](https://apps.apple.com/us/app/bevel-all-in-one-health-app/id6456176249)
- WHOOP: [What's new 2026](https://www.whoop.com/us/en/thelocker/2026-whats-new/), [Everything launched in 2025](https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/)
- Athlytic: [App Store](https://apps.apple.com/gb/app/id1543571755)
- Apple Fitness: [DC Rainmaker on training load](https://dcrainmaker.com/2024/06/apples-new-watchos-11-trainining-load-turn-by-turn-trail-routes-and-more.html), [9to5Mac on iOS 26 Fitness](https://9to5mac.com/2025/12/30/ios-26s-fitness-app-has-three-upgrades-ready-for-new-years-goals/)
