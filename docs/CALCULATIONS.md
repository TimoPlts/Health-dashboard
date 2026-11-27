# Calculations

Priority order: (1) provider originals → (2) published reproducible methods → (3) published alternatives → (4) clearly labelled app estimates.
Every calculation is a pure, versioned function in `src/lib/metrics/` with tests in `tests/unit/metrics.test.ts` and `tests/unit/analytics.test.ts`. The audit of 2026-11-26 is summarised in [FEATURE_AUDIT.md §3](FEATURE_AUDIT.md).
Raw data is kept, so any metric can be recalculated when a version changes. **Nothing here is medically validated by us.**

---

### HR-STATS · `hr-stats@1` — window heart-rate statistics (`heart-rate.ts → hrWindowStats`)
- **Formula:** each sample i represents `w_i = min(t_{i+1} − t_i, maxGap)` seconds (last sample: until window end). Mean = Σ bpm_i·w_i / Σ w_i. Min/max over samples in [start, end). Coverage = Σ w_i / window length.
- **Rationale:** irregular sampling (more samples during exercise) biases an unweighted mean. Capping gaps prevents off-wrist periods counting as time.
- **Inputs:** HR samples (bpm, instant). `maxGapS` default 30 s.
- **Missing data:** no samples → all values `null`, coverage 0. Gaps are never interpolated. UI warns when coverage < 80 %.
- **Units:** bpm, s. **Limitations:** the cap is a heuristic. Optical wrist HR lags and is less accurate during resistance training (grip, wrist flexion).

### HR-ZONES · Google zones (provider) and %HRmax zones (Baseline)
Baseline shows two zone systems. They answer different questions and are always labelled.
- **Google zones** (`timeInBands`, `daily-heart-rate-zones`, `time-in-heart-rate-zone`): LIGHT / MODERATE / VIGOROUS / PEAK.
  - Bounds are verified on real data: 40 / 60 / 85 % of heart-rate reserve with HRmax = 220 − age.
  - These drive Active Zone Minutes and are shown on workout pages and as daily metrics.
- **Baseline zones** (LOAD-ZONES below): Z1–Z5 by %HRmax, used for Edwards TRIMP and Zone 2.
- `timeInZones` / `zoneBoundsBpm` (Karvonen Z1–Z5) exist in `heart-rate.ts` but are **not used** by any page. `estimateMaxHrTanaka` is likewise unused; HRmax comes from HRMAX below.
- **Time:** gap-capped weights as in HR-STATS. **Units:** s / min.

### HR-RECOVERY · `workouts.ts → workoutDetail`
- HRR60 = HR(end) − HR(end + 60 s); HRR120 likewise. Each instant uses the nearest sample within ±10 s; if none → `null`.
- "End" is the end of the grouped Google exercise session(s).
- Ref: Cole et al. 1999 NEJM 341:1351.
- **Limitation:** auto-detected and Apple-Health-imported sessions end when the device or app decided the workout ended, not at the last effort. A cool-down walk inside the session lowers HRR. Treat it as indicative and compare only like with like.

### LOAD-TRIMP · `trimp-banister@1` (`training-load.ts → banisterTrimp`) · **not used**
Kept for reference only. It needs sex, which Google's profile does not provide; Baseline uses Edwards TRIMP (LOAD-EDWARDS).
- TRIMP = Σ Δt[min] · HRr · 0.64 · e^(k·HRr), HRr = (HR − HRrest)/(HRmax − HRrest) clamped to [0, 1]; k = 1.92 male, 1.67 female.
- Ref: Banister 1991; Morton, Fitz-Clarke & Banister 1990. **Missing:** gap-capped like HR-STATS; coverage returned.
- **Limitation:** heart rate under-represents resistance-training load (short sets, long rests). It is never presented as a measure of muscular fatigue.

### LOAD-EWMA · `ewma-load@1` (`ewmaLoad`)
- λ = 2/(N+1); acute N = 7, chronic N = 28; balance = chronic − acute. Ref: Williams et al. 2017 BJSM 51:209.
- **Missing:** `null` days (untracked) carry the previous EWMA and are flagged `gap`; only truly tracked rest days are 0.
- **Seeding:** both EWMAs start at the first tracked day's load. Early values are therefore weighted toward that day. After 21 tracked days the first day still carries about 24 % of EWMA₂₈'s weight, which is why ACWR is only reported after 21 tracked days.

> **STR-\* are dormant.** They need Hevy set data, which requires Hevy Pro; Hevy is out of scope ([ADR-0005](adr/0005-workouts-from-google.md)). The functions and tests are kept for a possible future import.

### STR-E1RM · `e1rm-epley@1` (`strength.ts → estimateOneRepMax`)
- 1RM = w·(1 + reps/30); reps = 1 → w. Valid for 1–12 reps, else `null`; warm-ups excluded. Alt: Brzycki w·36/(37 − reps).
- Ref: Epley 1985; Brzycki 1993; LeSuer et al. 1997 (accuracy degrades with reps). RPE/RIR adjustment is not applied in v1.

### STR-VOLUME · `volume-load@1` (`volumeLoad`)
- Volume load = Σ weight_kg × reps over non-warm-up sets. Working sets and reps are counted separately. Bodyweight sets add 0 kg but count as sets.
- Ref: Haff 2010 NSCA Coach 1(1). **Limitation:** bodyweight and assisted exercises are under-represented. Unilateral dumbbell loads are taken as logged.

### STR-MUSCLE · `muscle-sets@1` (`setsPerMuscle`)
- Primary muscle +1 set, each secondary +0.5 (configurable). **App convention** (fractional-set practice in hypertrophy research, e.g. Pelland et al. 2024), not a physiological measure.

### SLP-EFF · `sleep-efficiency@1` (`sleep-baseline.ts → sleepEfficiency`)
- SE = minutesAsleep / time in bed × 100, time in bed = Google sleep session interval. Ref: AASM definitions; Reed & Sacco 2016.
- **Missing:** either input `null` → `null`. Provider `minutesAsleep` is used, never recomputed from stages.

### SLP-STAGES · `stageMinutes`
- Σ stage segment durations, excluding `shortAwakenings` (already inside longer stages). Used for the legend; provider summary is preferred when present.

### BASE-ROLL · `baseline-rolling@1` (`rollingBaseline`, `zScore`)
- Baseline = mean & SD of the previous 28 days (current day excluded), minimum 14 valid days, else “baseline not established”. HRV is computed on ln(rMSSD) (Plews et al. 2013, Sports Med 43:773).
- Deviation = z-score. SD = 0 → `null`.

### HRMAX · `chooseHrMax` (`load.ts`)
- Order: owner override (Settings) → **220 − age** with age from Google's `users/me/profile`.
- **Why 220 − age:** verified on real data. Google's `daily-heart-rate-zones` bounds are exactly 40 / 60 / 85 % of heart-rate reserve with HRmax = 220 − age (Fox et al. 1971). Using the same HRmax keeps Baseline's zones consistent with Google's AZM zones. Tanaka (2001) 208 − 0.7·age is a documented alternative but is not used by default.
- **Limitation:** age-predicted HRmax has an SD of about 10 bpm. A measured HRmax can be set in Settings.

### LOAD-ZONES / LOAD-EDWARDS · `trimp-edwards@1` (`load.ts → zoneLoad`)
- Zones are %HRmax bands: Z1 50–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 ≥ 90 %. Edwards TRIMP = Σ minutes in Zi × i. Ref: Edwards 1993, *The Heart Rate Monitor Book*; Foster et al. 2001 JSCR 15:109.
- Inputs: all-day Fitbit heart-rate samples (3 s resolution) per civil day. Cached in `derived_daily` (`load_trimp`, `zone1..5_min`, `hr_worn_min`), recomputed after every sync.
- **Missing data:** gap-capped at 30 s per sample, as in HR-STATS. Days without samples get no row. `coverage` is stored with each value.
- **Why Edwards, not Banister:** it is sex-neutral (Google's profile has no sex field) and needs only HRmax. **Limitation:** it under-represents resistance-training load, as with any HR-based method.
- **Zone 2** = Z2 of this model (60–70 % HRmax), shown as minutes per day.
  - This is the 5-zone %HRmax convention (Edwards; Polar), not a lactate- or ventilatory-threshold Zone 2. Physiological Zone 2 (below the first lactate threshold) varies between people and is often 65–75 % HRmax in trained individuals.
  - Without a lab test, Baseline cannot locate your threshold. A measured HRmax (Settings) improves the estimate.
- **All-day load:** Z1 starts at 50 % HRmax (≈ 95 bpm for a 30-year-old), so brisk walking and stairs accrue load. That is part of Edwards' method; load is not workout-only.
- **"Cardio load" (strain) in the UI** = daily Edwards TRIMP. It is never scaled to a 0–21 range or called WHOOP strain.
  - The Today ring is **not a target**: it is full at twice your current 7-day average daily load (minimum 120). Today's value is labelled "so far" until the day is complete.

### LOAD-ACWR · `acwr-ewma@2` (`load.ts → acwr`, `trackedLoad`)
- ACWR = EWMA₇ / EWMA₂₈ of daily TRIMP (Williams et al. 2017 BJSM 51:209).
- Bands follow Gabbett 2016 BJSM 50:273: < 0.8 low, 0.8–1.3 optimal, 1.3–1.5 caution, > 1.5 high.
- Training balance = EWMA₂₈ − EWMA₇. It has the form of Coggan's training stress balance (fitness − fatigue), but with 28/7-day constants and Edwards TRIMP. It is an app convention, not TSB.
- **Tracked days (v2):**
  - The current, incomplete day is excluded: its partial load used to pull the acute EWMA down every morning. The ratio describes the state after the last complete day.
  - A day counts only with ≥ 10 h of heart-rate coverage. This is the conventional valid-day criterion for wearable data (Troiano et al. 2008 MSSE 40:181). Shorter wear would record artificially low load.
  - Other days are gaps, not zeros.
- **Calibration:** reported only after ≥ 21 tracked days in the last 28.
- **Limitation:** ACWR is a descriptive load signal. Its link with injury risk is debated (Impellizzeri et al. 2020), and Baseline does not present it as an injury predictor.

### REC-BASE · `baseline-rolling@1` via `recovery.ts → hrvBaseline / rhrBaseline`
- Window: the previous 28 days, excluding today. At least 14 values are needed; until then the status is `calibrating (have/14)`. HRV uses ln(rMSSD) (Plews et al. 2013).
- Inputs are Google's own nightly values (`daily-heart-rate-variability.averageHeartRateVariabilityMilliseconds`, `daily-resting-heart-rate`). Baseline does not recompute them.

### REC-INDEX · `recovery@2` (`recovery.ts → recoveryIndex`)
- Components, each 0–100:
  - HRV: 100·Φ((ln HRV − μ)/σ)
  - RHR: 100·Φ(−(RHR − μ)/σ)
  - Sleep: 100·min(1, asleep/need)
- Score = weighted mean with weights 0.45 / 0.30 / 0.25.
- Φ is the standard normal CDF (Abramowitz & Stegun 7.1.26), so the score is the percentile of today within your own normal range. 50 = a typical day for you.
- **Rationale for weights (app choice, not from a validation study):** HRV is the most sensitive single autonomic marker (Buchheit 2014 Front Physiol 5:73) and RHR comes second. Sleep is included because sleep loss suppresses recovery.
- **Missing data (v2):** the HRV component is required, i.e. a calibrated HRV baseline and a value for the night.
  - Without HRV the status is `calibrating (have/14)` or `missing`, with the reason.
  - RHR and sleep are optional; if one is missing, the remaining weights are renormalised and listed.
  - v1 also accepted RHR + sleep without HRV, which let sleep duration carry 45 % of a score still called "recovery".
- **Interpretation:** the score says how today compares with your own recent normal. It is not a measure of absolute fitness. A score of 50 every day is the expected average, not a problem.
- **Not** WHOOP Recovery, Bevel, Athlytic or Fitbit Daily Readiness. Those are proprietary.

### REC-READY · `readiness@1` (`trainingReadiness`)
- HRV-guided training (Kiviniemi et al. 2007; Plews et al. 2013; Javaloyes et al. 2019). The 7-day rolling mean of ln rMSSD, using at least 3 of the last 7 nights, is compared with the SWC band μ ± 0.5σ.
- Flags:
  - HRV below the band
  - RHR > μ + 1σ
  - ACWR > 1.5
- Readiness: no flags → `ready`; one flag → `caution`; two or more → `recover`. The output is categorical on purpose.
- **Method choice:** only a *decrease* below the band is a flag (Kiviniemi et al. 2007).
  - Javaloyes et al. 2019 also reduce intensity when the 7-day mean is *above* the band.
  - Baseline shows "above" but does not flag it: a rise with a normal RHR is usually benign in recreational athletes, and parasympathetic saturation is described mainly in highly trained endurance athletes (Plews et al. 2012 Eur J Appl Physiol 112:3729).

### REC-FATIGUE · `fatigue@1` (`fatigueFlags`)
Independent flags, each shown with its reason. They are never combined into a diagnosis.
- HRV below the SWC band
- RHR > baseline + 1 SD (Buchheit 2014)
- ACWR > 1.5
- 7-night sleep debt > 5 h, counted only when at least 5 of the 7 nights were tracked (app threshold; Van Dongen et al. 2003)
- Skin temperature > +1.0 °C vs Google's baseline (app threshold)
- Breathing rate > baseline + 2 SD (app threshold; Mishra et al. 2020)

### SLP-NEED · `sleep-need@1`
- Default 480 min, the midpoint of the 7–9 h recommendation (Hirshkowitz et al. 2015; Watson et al. 2015). It can be changed in Settings and is labelled an estimate.

### SLP-DEBT · `sleep-debt@1` (`sleep.ts → sleepDebt`)
- Σ max(0, need − asleep) over the last 7 nights that have data. Surplus is not banked (conservative).
- Untracked nights are skipped and the number of tracked nights is shown. The value is displayed only when at least 3 nights are tracked.

### SLP-SCORE · `sleep-score@1` (`sleepScore`)
- Components (0–100) and weights:
  - Duration (50 %): 100·min(1, asleep/need)
  - Efficiency (20 %): 0 at ≤ 70 % → 100 at ≥ 90 %
  - Deep sleep (15 %): 100 within 13–23 % of sleep, falling linearly to 0 at 0 % and 40 %
  - REM (15 %): 100 within 20–25 %, falling linearly to 0 at 0 % and 45 %
- References: norms from Ohayon et al. 2004 Sleep 27:1255; efficiency threshold from Reed & Sacco 2016.
- Stage components are used only for `STAGES` sleep. Otherwise the weights are renormalised.
- **Not** the Fitbit Sleep Score, which is not available through the API.

### SLP-SRI · `sleep-sri@2` (`sleepRegularityIndex`)
- Phillips et al. 2017 Sci Rep 7:3216: SRI = −100 + 200·P(same sleep/wake state 24 h apart), at minute resolution, over the last 14 nights.
- Windows run **noon to noon** (local noon before each wake date), so each 24 h window holds exactly one night. Only pairs of consecutive recorded nights are compared; ≥ 5 nights are needed.
  - v1 used midnight windows, so the evening of day d was compared with the start of night d+2, even when that night was not recorded.
- **Assumption:** outside recorded sleep, the wearer is awake.

### SLP-WASO · `sleep-waso@1` (`sleep-detail.ts → wakeAfterSleepOnset`)
- **Wake after sleep onset** = minutes in AWAKE stages between the first and the last non-AWAKE stage of the night. This is the standard sleep-lab measure of fragmentation (AASM scoring manual).
  - Time before falling asleep and after the final wake-up is excluded.
- **Wakings** = the number of those AWAKE segments. **Longest** = the longest one.
- Google's *short awakenings* (brief arousals inside a sleep stage) are counted separately and are not added to WASO.
- **Missing:** a night without stages → `null`, never 0.

### SLP-BEDTIME · `bedtime@1` (`sleep-detail.ts → recommendedBedtime`)
- time in bed = sleep need ÷ median sleep efficiency of the last 14 nights (needs ≥ 5 nights)
- bedtime = wake-up target − time in bed
- **Wake-up target:** your setting (Settings → Personal). Without one, your usual wake-up time is used: the median of the last 14 nights, needing ≥ 5. With neither, no recommendation is shown.
- **Why efficiency, not latency:** Google's sleep session runs from getting into bed to getting up, so falling-asleep time and night-time wakings are inside "time in bed" and already reflected in efficiency.
- With fewer than 5 nights the result is the bare minimum (need only), labelled "minimum".
- **Limitation:** sleep need is an estimate (SLP-NEED). The recommendation inherits that uncertainty.

### SLP-COMPARE · night comparison (`analytics/sleep-detail.ts`)
- This night vs the previous night vs the mean of the nights recorded in the last 14 days, for score, asleep, efficiency, deep, REM, WASO, wakings, bedtime and wake-up time.
- Means use only nights with that value.
- Overnight graphs:
  - heart rate: 1-minute means of the 3-second samples
  - HRV: 5-minute rMSSD samples, as recorded
  - SpO₂: per-minute samples, as recorded
  - All series cover the main sleep session, with gaps left as gaps.
- Naps (non-main sessions) are listed separately and never change the night's score, need or debt.

### SLP-MID · `sleep-midpoint-sd@1` (`midpointVariability`)
- Circular standard deviation of sleep midpoints in local time, in minutes. Needs ≥ 5 nights.

### WORKOUTS · `workouts@1` (`src/server/analytics/workouts.ts`)
- Source: Google `exercise` sessions, from all sources, with provenance kept. Verified on real data: Hevy writes each workout to Apple Health, which Google imports as `HEALTH_KIT` / `com.hevyapp.hevy`. These carry the type (`STRENGTH_TRAINING`), a generic name, an active duration and Hevy's calorie estimate. **No exercises, sets, reps or weights**, and none are fabricated. Hevy sometimes writes a workout twice, and the Fitbit Air may detect it too.
- Grouping: sessions are merged when they have the same `exerciseType` and overlap ≥ 50 % of the shorter one.
  - Primary session: the Fitbit-recorded one, else the longest.
  - Analysis window: the union of the grouped intervals.
  - Calories: from the primary session, else the first session that has them, with the source named.
- Heart-rate metrics in the window: HR-STATS (avg/min/max, coverage), LOAD-EDWARDS (TRIMP, %HRmax zones), Google's zones (`timeInBands`), and HR recovery (drop at +60 s and +120 s, requiring samples within ±10 s).
- Sessions shorter than 60 s are listed but not analysed.
- **Exclusions** live in `exercise_exclusions` and never modify provider rows. Excluded workouts are left out of workout counts, totals and comparisons. All-day load (`load_trimp`) is heart-rate based and therefore unaffected.

### ENERGY · provider values only
- **Total energy** = Google's `total-calories` daily roll-up (BMR + activity), and **active energy** = Σ reconciled `active-energy-burned`. Both are Google estimates from heart rate, movement and profile data, and are labelled "est.".
- Baseline computes no calories of its own and does not add BMR: `basal-energy-burned` is empty for this account.
- **Energy per heart-rate zone** = Google's `calories-in-heart-rate-zone` roll-up.
- Wrist-worn energy estimates have large individual errors (median absolute error often 20–40 %; Shcherbina et al. 2017 J Pers Med 7:3). Use them for trends, not exact energy balance.

### NIGHT-ATTRIBUTED SAMPLES · `nightSampleSeries`, `dailyAttrSeries`
- Overnight samples (breathing rate by sleep stage) are attributed to the **wake date** of the main sleep session that contains them. Grouping by civil day would split a night at midnight.
  - Verified on real data: all HRV and breathing-rate samples, and 766 of 769 SpO₂ samples, fall inside a sleep session.
- **SpO₂ low end** = Google's `lowerBoundPercentage` reported with the nightly average. Baseline does not take the minimum of single samples, which motion artefacts can dominate.

### WORKOUT-LABELS · `workout_annotations` (`analytics/workouts.ts`, `lib/metrics/workout-labels.ts`)
- **What you can set:** a name, a category (push, pull, legs, upper, full body, cardio, rest) and an effort rating (1–10, perceived exertion).
- **Storage:** stored in Baseline only, for every session of a grouped workout, so a label survives when another duplicate session arrives. Provider rows are never changed.
- **Similar workouts:** the same category when labelled, otherwise the same exercise type without a different label. The last 6 months, excluding excluded and too-short workouts.
  - The average row needs ≥ 2 similar workouts.
- **Cardio classification:** a category label wins. Without one, aerobic exercise types count as cardio (running, walking, cycling, swimming, rowing, elliptical, HIIT, hiking, stairs, …; see `CARDIO_TYPE`).
- **Effort** is subjective and is shown next to heart-rate load. It is never mixed into it.

### CARDIO-WEEK · weekly cardio (`analytics/cardio.ts`, `lib/metrics/periods.ts`)
- **Weeks:** ISO weeks (Monday–Sunday).
  - Weekly totals are sums of the days with data (Zone 2 and Z1–Z5 minutes, Active Zone Minutes by zone, cardio load, cardio sessions and minutes).
  - Resting heart rate is the mean of the days with data.
  - A week with no heart rate and no workouts is **missing** (null), not zero.
- **Current week:** shown as "so far", including today. Comparisons with the week before and the 4-week average use **complete weeks only**.
- **Targets:**
  - Your goals (Zone 2 per week, AZM per week, cardio sessions per week) are shown only when set.
  - Without an AZM goal, the ring shows the **WHO 2020 guideline** of 150 min/week of moderate activity as a reference, labelled "WHO guideline" (Bull et al. 2020 BJSM 54:1451). Active Zone Minutes count vigorous minutes double, as the WHO equivalence allows.
- **Zones:**
  - Baseline's Z2 is 60–70 % HRmax, an approximation of the aerobic zone. **Physiological Zone 2** (below the first lactate or ventilatory threshold) needs a test, and the page says so.
  - Google's zones (heart-rate reserve) are shown separately as AZM by zone.
- **Load ratio** is shown with its limitation: it describes change in load. It is not an injury prediction and not a safe-training target (LOAD-ACWR).

### GOALS · `goals@1` (`lib/metrics/goals.ts`, `analytics/goals.ts`)
- **Goals:** all optional; nothing is assumed.
  - Daily: steps, active minutes, sleep, in bed by, wake-up time.
  - Weekly (ISO weeks): Active Zone Minutes, Zone 2 minutes, cardio sessions.
- **Status:**
  - **met** as soon as the target is reached
  - **missed** only when the day or week is complete and the target was not reached
  - **in progress** for the running day or week
  - **no data** when nothing was recorded; never counted as missed
- **Clock goals:** *in bed by* is met up to 15 min after the target. *Wake-up* is met within ±30 min of the target. Both are evaluated on the night that ends that morning; times are compared across midnight.
- **Completion rate** = met ÷ (met + missed) over the last 28 days or 8 weeks. Periods without data are left out.
- **Limitation:** sleep and bedtime use Google's sleep session times, not when you tried to fall asleep.

### JOURNAL · `journal@1` (`lib/metrics/journal.ts`, `server/journal.ts`)
- **Habits:** defined by you, as yes/no (stored 1/0), an amount with a unit, or a 1–5 scale.
  - Eight suggested habits are created once and can be edited or removed: caffeine, supplements, creatine, stress, late meal, alcohol, stretching, fatigue.
- **No entry means not logged**, which is never read as "no" or zero. Clearing a habit removes the entry.
- **Removing a habit:** archiving keeps its history (it can be restored); deleting removes the habit and all its entries.
- No associations are computed in this milestone (Milestone C adds safeguarded associations).

### TODAY-LAYOUT (`lib/today-layout.ts`)
- **Cards:** recovery/sleep/load, goals, last night, favourite metrics (up to 8), vitals, activity, journal, workouts. Each can be reordered or hidden.
- **Saved layouts:** unknown ids are dropped. Cards added in later versions are appended at the end, so your order is never shuffled. Reset deletes the saved layout.

### WEIGHT · `weight-trend@1` (`lib/metrics/weight.ts`, `server/weight.ts`, `analytics/body.ts`)
- **Sources:**
  - Google weight records (synced with the other streams).
  - Manual entries, stored as observations with Baseline's own source (`provider: baseline`, `MANUAL`). Never sent to Google, never touched by sync.
  - A manual entry within **30 min and 0.1 kg** of any existing entry is refused as a duplicate.
- **Daily weight** = mean of that day's entries.
- **Trend:** exponential smoothing that moves 10 % toward each new weight per day (Walker, *The Hacker's Diet*), time-aware: trend_i = trend_{i−1} + (1 − 0.9^Δdays)(w_i − trend_{i−1}). Held between weigh-ins; never interpolated.
- **Change:** trend now − trend 7 or 30 days earlier.
  - Weekly needs ≥ 2 entries in 14 days and ≥ 7 days of history.
  - Monthly needs ≥ 4 entries in 45 days and ≥ 30 days of history.
- **Goal:** remaining = target − trend.
  - A projection (weeks at the 30-day trend rate) is shown only when the trend moves toward the goal and history is ≥ 21 days.
  - It is labelled a projection, not a prediction.
- **Limitation:** weighing at different times of day adds noise. A morning routine gives the steadiest trend.

### ENERGY-BALANCE · `energy-balance@1` (`lib/metrics/associations.ts → energyBalance`)
- Mean of (intake − expenditure) over the days in the last 14 complete days that have **both**. It needs ≥ 7 such days.
- No intake source is connected (Google nutrition data needs an app that writes it, and a nutrition scope). The page says so and Baseline does not estimate intake.
- Both sides are estimates (ENERGY).

### REPORTS · `report@1` (`analytics/reports.ts`)
- **Periods:** ISO weeks or calendar months.
  - Current period: **complete days only** (today and future days excluded). It is marked "in progress" with n of N days.
  - Previous period: the one before.
  - Your normal: mean ± SD of the 28 days before the period (≥ 14 values); "baseline n/14" until then.
- **Metric rows:**
  - Every row is the **average per day with data**, so partial periods compare fairly. Daily totals also show the period total and the day count.
  - Sleep debt and SRI are taken at the last complete day.
- **Workouts:** count, time and cardio sessions (non-excluded).
- **Goals:** completion within the period (GOALS rules). Weekly goals count complete weeks that start in the period.
- **Text:** fixed wording only, no generated text.

### ASSOCIATIONS · `assoc@1` (`lib/metrics/associations.ts`, `analytics/associations.ts`)
- **Pairing:** habit on day D vs the **next morning's** HRV, resting HR, time asleep, sleep efficiency and recovery, over the last 120 days. Days without a log or without the outcome are left out (unlogged ≠ no).
- **Yes/no habits:** mean after "yes" − mean after "no", with a Welch 95 % interval (t quantile by Cornish–Fisher expansion). Needs **≥ 8 days in each group**.
- **Amounts and 1–5 scales:** Spearman rank correlation, 95 % interval via Fisher z with SE = 1.06/√(n − 3) (Fieller, Hartley & Pearson 1957). Needs **≥ 20 days**. No variation → not computed.
- **Display:**
  - Below the minimums, only progress is shown.
  - Results whose interval excludes 0 are listed first; the rest are behind "Show all".
  - The number of comparisons and the expected chance findings (about 1 in 20) are stated.
- **Wording:** "associated with", never "caused".
- **Limitations:** confounding (training, illness, weekdays) is not adjusted for. Exploratory only.

### Aggregation rules (all metric pages)
- Weekly, monthly and period values are the **mean of the days that have data**. For additive metrics (steps, energy, minutes) that is the mean daily total. Missing days are never counted as 0. The number of days with data is shown next to every average.
- **Incomplete day:** for daily totals (`agg: sum`: steps, energy, minutes, load, sedentary time) the current day is shown as "so far" but left out of averages, min/max, comparisons and baselines. The change vs baseline is hidden for it.
- Period comparison: the selected range vs the previous range of equal length.
- Metric baseline: the mean ± SD of the 28 days before the selected end date, shown once 14 values exist.
