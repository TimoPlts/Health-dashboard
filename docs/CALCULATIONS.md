# Calculations

Priority order: (1) provider originals → (2) published reproducible methods → (3) published alternatives → (4) clearly labelled app estimates.
Every calculation is a pure, versioned function in `src/lib/metrics/` with tests in `tests/unit/metrics.test.ts`.
Raw data is kept, so any metric can be recalculated when a version changes. **Nothing here is medically validated by us.**

---

### HR-STATS · `hr-stats@1` — window heart-rate statistics (`heart-rate.ts → hrWindowStats`)
- **Formula:** each sample i represents `w_i = min(t_{i+1} − t_i, maxGap)` seconds (last sample: until window end). Mean = Σ bpm_i·w_i / Σ w_i. Min/max over samples in [start, end). Coverage = Σ w_i / window length.
- **Rationale:** irregular sampling (more samples during exercise) biases an unweighted mean. Capping gaps prevents off-wrist periods counting as time.
- **Inputs:** HR samples (bpm, instant). `maxGapS` default 30 s.
- **Missing data:** no samples → all values `null`, coverage 0. Gaps are never interpolated. UI warns when coverage < 80 %.
- **Units:** bpm, s. **Limitations:** the cap is a heuristic. Optical wrist HR lags and is less accurate during resistance training (grip, wrist flexion).

### HR-ZONES · `hr-zones@1` (`timeInZones`, `timeInBands`, `zoneBoundsBpm`)
- **Provider zones first:** Google `daily-heart-rate-zones` (LIGHT/MODERATE/VIGOROUS/PEAK, Karvonen-based) for the workout’s civil day.
- **Custom (HRR / Karvonen):** bound(p) = HRrest + p·(HRmax − HRrest); Z1 50–60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 ≥ 90 %. Ref: Karvonen et al. 1957; ACSM Guidelines 11th ed.
- **HRmax** default when unknown: Tanaka 2001 `208 − 0.7·age` (population estimate, ±10 bpm SD). A measured HRmax is preferred (settings, planned).
- **Time:** same gap-capped weights as HR-STATS. **Units:** s.

### HR-RECOVERY · inline in `queries.ts`
- HRR60 = HR(end) − HR(end + 60 s); HRR120 likewise. Each instant uses the nearest sample within ±10 s; if none → `null`.
- Ref: Cole et al. 1999 NEJM 341:1351. **Limitation:** Hevy “end” is when you tapped Finish, not the last set. Treat as indicative.

### LOAD-TRIMP · `trimp-banister@1` (`training-load.ts → banisterTrimp`)
- TRIMP = Σ Δt[min] · HRr · 0.64 · e^(k·HRr), HRr = (HR − HRrest)/(HRmax − HRrest) clamped to [0, 1]; k = 1.92 male, 1.67 female.
- Ref: Banister 1991; Morton, Fitz-Clarke & Banister 1990. **Missing:** gap-capped like HR-STATS; coverage returned.
- **Limitation:** heart rate under-represents resistance-training load (short sets, long rests). It is never presented as a measure of muscular fatigue.

### LOAD-EWMA · `ewma-load@1` (`ewmaLoad`)
- λ = 2/(N+1); acute N = 7, chronic N = 28; balance = chronic − acute. Ref: Williams et al. 2017 BJSM 51:209.
- **Missing:** `null` days (untracked) carry the previous EWMA and are flagged `gap`; only truly tracked rest days are 0.

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
- **Zone 2** = Z1-index 2 (60–70 % HRmax), shown as minutes per day.
- **"Cardio load" (strain) in the UI** = daily Edwards TRIMP. It is never scaled to a 0–21 range or called WHOOP strain.

### LOAD-ACWR · `acwr-ewma@1` (`load.ts → acwr`)
- ACWR = EWMA₇ / EWMA₂₈ of daily TRIMP (Williams et al. 2017 BJSM 51:209).
- Bands follow Gabbett 2016 BJSM 50:273: < 0.8 low, 0.8–1.3 optimal, 1.3–1.5 caution, > 1.5 high.
- Training balance = EWMA₂₈ − EWMA₇.
- **Calibration:** reported only after ≥ 21 tracked days in the last 28. Untracked days are gaps, not zeros.
- **Limitation:** ACWR is a descriptive load signal. Its link with injury risk is debated (Impellizzeri et al. 2020), and Baseline does not present it as an injury predictor.

### REC-BASE · `baseline-rolling@1` via `recovery.ts → hrvBaseline / rhrBaseline`
- Window: the previous 28 days, excluding today. At least 14 values are needed; until then the status is `calibrating (have/14)`. HRV uses ln(rMSSD) (Plews et al. 2013).
- Inputs are Google's own nightly values (`daily-heart-rate-variability.averageHeartRateVariabilityMilliseconds`, `daily-resting-heart-rate`). Baseline does not recompute them.

### REC-INDEX · `recovery@1` (`recovery.ts → recoveryIndex`)
- Components, each 0–100:
  - HRV: 100·Φ((ln HRV − μ)/σ)
  - RHR: 100·Φ(−(RHR − μ)/σ)
  - Sleep: 100·min(1, asleep/need)
- Score = weighted mean with weights 0.45 / 0.30 / 0.25. If a component is missing, the remaining weights are renormalised.
- Φ is the standard normal CDF (Abramowitz & Stegun 7.1.26), so the score is the percentile of today within your own normal range. 50 = a typical day for you.
- **Rationale for weights (app choice):** HRV is the most sensitive single autonomic marker (Buchheit 2014 Front Physiol 5:73) and RHR comes second. Sleep is included because sleep loss suppresses recovery.
- **Missing data:** at least one of HRV and RHR needs a calibrated baseline; sleep alone never yields a recovery score. Otherwise the status is `calibrating` or `missing`, with the reason.
- **Not** WHOOP Recovery, Bevel, Athlytic or Fitbit Daily Readiness. Those are proprietary.

### REC-READY · `readiness@1` (`trainingReadiness`)
- HRV-guided training (Kiviniemi et al. 2007; Plews et al. 2013; Javaloyes et al. 2019). The 7-day rolling mean of ln rMSSD, using at least 3 of the last 7 nights, is compared with the SWC band μ ± 0.5σ.
- Flags:
  - HRV below the band
  - RHR > μ + 1σ
  - ACWR > 1.5
- Readiness: no flags → `ready`; one flag → `caution`; two or more → `recover`. The output is categorical on purpose.

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

### SLP-SRI · `sleep-sri@1` (`sleepRegularityIndex`)
- Phillips et al. 2017 Sci Rep 7:3216: SRI = −100 + 200·P(same sleep/wake state 24 h apart), at minute resolution, over the last 14 nights. It compares only pairs of consecutive recorded nights and needs ≥ 5 nights.
- **Assumption:** outside recorded sleep, the wearer is awake.

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

### Aggregation rules (all metric pages)
- Weekly, monthly and period values are the **mean of the days that have data**. For additive metrics (steps, energy, minutes) that is the mean daily total. Missing days are never counted as 0. The number of days with data is shown next to every average.
- Period comparison: the selected range vs the previous range of equal length.
- Metric baseline: the mean ± SD of the 28 days before the selected end date, shown once 14 values exist.
