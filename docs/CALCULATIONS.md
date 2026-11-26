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

### Planned (not implemented — will follow the same template)
- **Recovery index (app-specific):** weighted HRV-z, RHR-z (inverted), sleep vs. need, prior-day TRIMP. Weights published here and shown expanded in the UI. **Never called WHOOP/Fitbit-equivalent.**
- **Sleep Regularity Index** (Phillips et al. 2017), **sleep need/debt** (rolling, labelled estimate), **HR-based calories** (Keytel et al. 2005, labelled estimate), **BMI**.
