/**
 * Every measurement Baseline can show, with its source, unit, explanation and methodology.
 * The UI is generated from this list, so adding a metric here gives it a detail page, a trend and a place in the
 * "All measurements" index. Descriptions are plain language; methodology points to docs/CALCULATIONS.md.
 */
export type MetricGroup = "recovery" | "heart" | "sleep" | "activity" | "load" | "vitals" | "body";
export type Tone = "heart" | "sleep" | "activity" | "recovery" | "load" | "body" | "vitals";

export type SeriesSpec =
  | { kind: "daily"; metric: string }
  | { kind: "interval"; dataType: string; variant?: string; scale?: number }
  | { kind: "sample"; dataType: string; agg?: "avg" | "min" | "max" }
  | { kind: "derived"; metric: string; scale?: number }
  | { kind: "night"; field: "asleep" | "inBed" | "efficiency" | "deep" | "rem" | "light" | "awake" | "latency" | "bedtime" | "wake" }
  | { kind: "score"; field: "recovery" | "sleepScore" | "sleepDebt" | "acwr" | "strain" | "balance" };

export interface MetricDef {
  id: string;
  label: string;
  short?: string;
  group: MetricGroup;
  tone: Tone;
  unit: string;
  decimals: number;
  series: SeriesSpec;
  /** How a week/month aggregates daily values. */
  agg: "mean" | "sum";
  /** Which direction is generally favourable — only used for wording, never for colour judgements of health. */
  better?: "higher" | "lower";
  /** Personal 28-day baseline is meaningful for this metric. */
  baseline?: boolean;
  /** Value is a time of day: minutes after `clockBase` minutes past midnight (bedtime uses noon so 23:30 and 00:30 are adjacent). */
  clock?: boolean;
  clockBase?: number;
  source: string;
  explanation: string;
  method?: string;
  estimate?: boolean;
}

const G = "Google Health API";
export const METRICS: MetricDef[] = [
  // Recovery & load (computed by Baseline)
  { id: "recovery", label: "Recovery", group: "recovery", tone: "recovery", unit: "", decimals: 0, series: { kind: "score", field: "recovery" }, agg: "mean", better: "higher",
    source: "Baseline (from Google HRV, resting HR and sleep)", estimate: true,
    explanation: "How today's overnight HRV, resting heart rate and sleep compare with your own recent normal. 50 is a typical day for you.",
    method: "recovery@1 — percentile of today's ln(HRV) and resting HR within your 28-day baseline (weights 45/30 %), plus sleep vs need (25 %). Needs 14 days of data. App-specific; not WHOOP, Bevel or Fitbit Readiness." },
  { id: "strain", label: "Cardio load", short: "Load", group: "load", tone: "load", unit: "TRIMP", decimals: 0, series: { kind: "score", field: "strain" }, agg: "sum", better: undefined, baseline: true,
    source: "Baseline (from Fitbit heart rate)", explanation: "Cardiovascular load of the whole day: minutes spent in each heart-rate zone, weighted 1–5 by intensity.",
    method: "trimp-edwards@1 — Edwards TRIMP over all-day heart rate; zones as % of HRmax (220 − age, as Google uses)." },
  { id: "acwr", label: "Acute : chronic load", short: "Load ratio", group: "load", tone: "load", unit: "×", decimals: 2, series: { kind: "score", field: "acwr" }, agg: "mean",
    source: "Baseline", explanation: "Your last 7 days of load compared with your last 28. Around 0.8–1.3 means load is building steadily; above 1.5 is a sudden spike.",
    method: "acwr-ewma@1 — EWMA 7 / EWMA 28 (Williams 2017; bands after Gabbett 2016). Needs 21 tracked days." },
  { id: "balance", label: "Training balance", group: "load", tone: "load", unit: "", decimals: 0, series: { kind: "score", field: "balance" }, agg: "mean",
    source: "Baseline", explanation: "Chronic minus acute load. Positive: fresher than your usual; negative: carrying recent fatigue.",
    method: "EWMA 28 − EWMA 7 of daily TRIMP. Needs 21 tracked days." },
  { id: "zone2", label: "Zone 2", group: "load", tone: "load", unit: "min", decimals: 0, series: { kind: "derived", metric: "zone2_min" }, agg: "sum", better: "higher",
    source: "Baseline (from Fitbit heart rate)", explanation: "Minutes at 60–70 % of your maximum heart rate — easy aerobic intensity.", method: "Edwards zone 2 over all-day heart rate (gap-aware)." },
  ...[1, 3, 4, 5].map((z) => ({ id: `zone${z}`, label: `Zone ${z}`, group: "load" as const, tone: "load" as const, unit: "min", decimals: 0, series: { kind: "derived" as const, metric: `zone${z}_min` }, agg: "sum" as const,
    source: "Baseline (from Fitbit heart rate)", explanation: `Minutes at ${[50, 60, 70, 80, 90][z - 1]}–${z === 5 ? 100 : [60, 70, 80, 90][z - 1]} % of your maximum heart rate.`, method: "Edwards %HRmax zones over all-day heart rate." })),

  // Heart
  { id: "resting_hr", label: "Resting heart rate", short: "Resting HR", group: "heart", tone: "heart", unit: "bpm", decimals: 0, series: { kind: "daily", metric: "resting_hr" }, agg: "mean", better: "lower", baseline: true,
    source: `${G} · daily-resting-heart-rate (Fitbit Air)`, explanation: "Your heart rate at complete rest, calculated by Fitbit mostly from sleep. Lower usually means better cardiovascular fitness and recovery." },
  { id: "hrv", label: "Heart rate variability", short: "HRV", group: "heart", tone: "heart", unit: "ms", decimals: 0, series: { kind: "daily", metric: "hrv_rmssd_daily" }, agg: "mean", better: "higher", baseline: true,
    source: `${G} · daily-heart-rate-variability (RMSSD)`, explanation: "Beat-to-beat variation of your heart during sleep (RMSSD). Higher than your usual generally indicates good recovery; compare with yourself, not others.",
    method: "Baseline on ln(RMSSD), 28 days (Plews 2013)." },
  { id: "hrv_deep", label: "HRV in deep sleep", group: "heart", tone: "heart", unit: "ms", decimals: 0, series: { kind: "daily", metric: "hrv_rmssd_deep_sleep" }, agg: "mean", better: "higher", baseline: true,
    source: `${G} · daily-heart-rate-variability`, explanation: "RMSSD measured only during deep sleep, when breathing and movement disturb it least." },
  { id: "sleeping_hr", label: "Sleeping heart rate", group: "heart", tone: "heart", unit: "bpm", decimals: 0, series: { kind: "daily", metric: "hr_non_rem" }, agg: "mean", better: "lower", baseline: true,
    source: `${G} · daily-heart-rate-variability (non-REM HR)`, explanation: "Average heart rate during non-REM sleep." },
  { id: "hr_avg", label: "Average heart rate", group: "heart", tone: "heart", unit: "bpm", decimals: 0, series: { kind: "daily", metric: "hr_day_avg" }, agg: "mean", baseline: true,
    source: `${G} · heart-rate dailyRollUp`, explanation: "Average of all heart-rate samples that day." },
  { id: "hr_min", label: "Lowest heart rate", group: "heart", tone: "heart", unit: "bpm", decimals: 0, series: { kind: "daily", metric: "hr_day_min" }, agg: "mean",
    source: `${G} · heart-rate dailyRollUp`, explanation: "Lowest heart-rate sample of the day." },
  { id: "hr_max", label: "Highest heart rate", group: "heart", tone: "heart", unit: "bpm", decimals: 0, series: { kind: "daily", metric: "hr_day_max" }, agg: "mean",
    source: `${G} · heart-rate dailyRollUp`, explanation: "Highest heart-rate sample of the day." },
  { id: "hrv_entropy", label: "HRV entropy", group: "heart", tone: "heart", unit: "", decimals: 2, series: { kind: "daily", metric: "hrv_entropy" }, agg: "mean",
    source: `${G} · daily-heart-rate-variability`, explanation: "Complexity of the beat-to-beat signal during sleep, as reported by Fitbit." },
  { id: "worn", label: "Heart rate coverage", group: "heart", tone: "heart", unit: "h", decimals: 1, series: { kind: "derived", metric: "hr_worn_min", scale: 1 / 60 }, agg: "mean",
    source: "Baseline (from Fitbit heart rate)", explanation: "Hours of the day covered by heart-rate samples. Low coverage makes daily load less complete.", method: "Σ sample durations, gaps > 30 s excluded." },

  // Vitals
  { id: "spo2", label: "Blood oxygen", short: "SpO₂", group: "vitals", tone: "vitals", unit: "%", decimals: 1, series: { kind: "daily", metric: "spo2_avg" }, agg: "mean", baseline: true,
    source: `${G} · daily-oxygen-saturation`, explanation: "Average oxygen saturation during sleep. Not a medical measurement." },
  { id: "respiratory_rate", label: "Breathing rate", group: "vitals", tone: "vitals", unit: "br/min", decimals: 1, series: { kind: "daily", metric: "respiratory_rate" }, agg: "mean", baseline: true,
    source: `${G} · daily-respiratory-rate`, explanation: "Average breaths per minute during sleep. A rise above your normal can come with illness or strain." },
  { id: "skin_temp", label: "Skin temperature change", short: "Skin temp Δ", group: "vitals", tone: "vitals", unit: "°C", decimals: 1, series: { kind: "daily", metric: "skin_temp_deviation" }, agg: "mean",
    source: `${G} · daily-sleep-temperature-derivations`, explanation: "Nightly skin temperature relative to Fitbit's own baseline for you (+/− °C)." },
  { id: "skin_temp_abs", label: "Nightly skin temperature", short: "Skin temp", group: "vitals", tone: "vitals", unit: "°C", decimals: 2, series: { kind: "daily", metric: "skin_temp_nightly" }, agg: "mean",
    source: `${G} · daily-sleep-temperature-derivations`, explanation: "Absolute nightly skin temperature measured at the wrist." },
  { id: "vo2max", label: "Cardio fitness (VO₂ max)", short: "VO₂ max", group: "vitals", tone: "vitals", unit: "ml/kg/min", decimals: 1, series: { kind: "daily", metric: "vo2max" }, agg: "mean", better: "higher",
    source: `${G} · daily-vo2-max`, explanation: "Fitbit's estimate of your maximal oxygen uptake.", estimate: true },
  { id: "run_vo2max", label: "Running VO₂ max", group: "vitals", tone: "vitals", unit: "ml/kg/min", decimals: 1, series: { kind: "sample", dataType: "run-vo2-max" }, agg: "mean", better: "higher",
    source: `${G} · run-vo2-max`, explanation: "VO₂ max estimated from runs.", estimate: true },

  // Sleep
  { id: "sleep_score", label: "Sleep score", group: "sleep", tone: "sleep", unit: "", decimals: 0, series: { kind: "score", field: "sleepScore" }, agg: "mean", better: "higher",
    source: "Baseline (from Google sleep)", estimate: true, explanation: "How complete and restful last night was: duration vs your need, efficiency, deep and REM proportions.",
    method: "sleep-score@1 — duration 50 %, efficiency 20 %, deep 15 %, REM 15 % against published adult norms. Not the Fitbit Sleep Score." },
  { id: "sleep_asleep", label: "Time asleep", group: "sleep", tone: "sleep", unit: "h", decimals: 1, series: { kind: "night", field: "asleep" }, agg: "mean", better: "higher", baseline: true,
    source: `${G} · sleep (main sleep)`, explanation: "Total minutes asleep in your main sleep, excluding time awake." },
  { id: "sleep_debt", label: "Sleep debt", group: "sleep", tone: "sleep", unit: "h", decimals: 1, series: { kind: "score", field: "sleepDebt" }, agg: "mean", better: "lower", estimate: true,
    source: "Baseline", explanation: "How far short of your sleep need you were over the last 7 nights.", method: "sleep-debt@1 — Σ max(0, need − asleep); surplus is not banked; untracked nights skipped." },
  { id: "sleep_in_bed", label: "Time in bed", group: "sleep", tone: "sleep", unit: "h", decimals: 1, series: { kind: "night", field: "inBed" }, agg: "mean", source: `${G} · sleep`, explanation: "From falling asleep window start to getting up." },
  { id: "sleep_efficiency", label: "Sleep efficiency", group: "sleep", tone: "sleep", unit: "%", decimals: 0, series: { kind: "night", field: "efficiency" }, agg: "mean", better: "higher", baseline: true,
    source: `${G} · sleep`, explanation: "Share of time in bed actually asleep. 85 % or more is considered good.", method: "sleep-efficiency@1 — asleep ÷ time in bed." },
  { id: "sleep_deep", label: "Deep sleep", group: "sleep", tone: "sleep", unit: "h", decimals: 1, series: { kind: "night", field: "deep" }, agg: "mean", source: `${G} · sleep stages`, explanation: "Slow-wave sleep — physically restorative. Typically 13–23 % of the night." },
  { id: "sleep_rem", label: "REM sleep", group: "sleep", tone: "sleep", unit: "h", decimals: 1, series: { kind: "night", field: "rem" }, agg: "mean", source: `${G} · sleep stages`, explanation: "Dream sleep, important for memory and mood. Typically 20–25 % of the night." },
  { id: "sleep_light", label: "Light sleep", group: "sleep", tone: "sleep", unit: "h", decimals: 1, series: { kind: "night", field: "light" }, agg: "mean", source: `${G} · sleep stages`, explanation: "Light sleep, usually about half of the night." },
  { id: "sleep_awake", label: "Awake", group: "sleep", tone: "sleep", unit: "min", decimals: 0, series: { kind: "night", field: "awake" }, agg: "mean", better: "lower", source: `${G} · sleep stages`, explanation: "Minutes awake after first falling asleep." },
  { id: "sleep_latency", label: "Time to fall asleep", group: "sleep", tone: "sleep", unit: "min", decimals: 0, series: { kind: "night", field: "latency" }, agg: "mean", source: `${G} · sleep summary`, explanation: "Minutes between going to bed and falling asleep." },
  { id: "bedtime", label: "Bedtime", group: "sleep", tone: "sleep", unit: "", decimals: 0, series: { kind: "night", field: "bedtime" }, agg: "mean", clock: true, clockBase: 720, source: `${G} · sleep`, explanation: "When your main sleep started (local time)." },
  { id: "wake_time", label: "Wake time", group: "sleep", tone: "sleep", unit: "", decimals: 0, series: { kind: "night", field: "wake" }, agg: "mean", clock: true, clockBase: 0, source: `${G} · sleep`, explanation: "When your main sleep ended (local time)." },

  // Activity
  { id: "steps", label: "Steps", group: "activity", tone: "activity", unit: "", decimals: 0, series: { kind: "interval", dataType: "steps" }, agg: "sum", better: "higher",
    source: `${G} · steps (reconciled: Fitbit Air + iPhone)`, explanation: "Steps counted by your Fitbit Air, with your iPhone filling gaps. Google merges both, so nothing is counted twice." },
  { id: "distance", label: "Distance", group: "activity", tone: "activity", unit: "km", decimals: 2, series: { kind: "interval", dataType: "distance", scale: 0.001 }, agg: "sum", better: "higher",
    source: `${G} · distance (reconciled)`, explanation: "Walking and running distance, estimated from steps and stride length.", estimate: true },
  { id: "floors", label: "Floors", group: "activity", tone: "activity", unit: "", decimals: 0, series: { kind: "interval", dataType: "floors" }, agg: "sum", source: `${G} · floors (reconciled)`, explanation: "Flights of stairs climbed." },
  { id: "active_kcal", label: "Active energy", group: "activity", tone: "activity", unit: "kcal", decimals: 0, series: { kind: "interval", dataType: "active-energy-burned" }, agg: "sum", estimate: true,
    source: `${G} · active-energy-burned (reconciled)`, explanation: "Energy burned through movement, above resting." },
  { id: "total_kcal", label: "Total energy", group: "activity", tone: "activity", unit: "kcal", decimals: 0, series: { kind: "daily", metric: "total_kcal" }, agg: "sum", estimate: true,
    source: `${G} · total-calories dailyRollUp`, explanation: "Total energy burned including resting metabolism, as estimated by Google." },
  { id: "azm", label: "Active Zone Minutes", short: "AZM", group: "activity", tone: "activity", unit: "min", decimals: 0, series: { kind: "interval", dataType: "active-zone-minutes" }, agg: "sum", better: "higher",
    source: `${G} · active-zone-minutes`, explanation: "Google's measure of heart-pumping activity: 1 per minute in fat-burn, 2 per minute in cardio or peak. WHO guidance ≈ 150 per week." },
  { id: "active_min", label: "Active minutes", group: "activity", tone: "activity", unit: "min", decimals: 0, series: { kind: "interval", dataType: "active-minutes" }, agg: "sum", better: "higher",
    source: `${G} · active-minutes`, explanation: "Minutes of light, moderate and vigorous activity." },
  { id: "sedentary", label: "Sedentary time", group: "activity", tone: "activity", unit: "h", decimals: 1, series: { kind: "interval", dataType: "sedentary-period", scale: 1 / 60 }, agg: "mean", better: "lower",
    source: `${G} · sedentary-period`, explanation: "Time spent sitting or lying still while awake." },
  { id: "swim_strokes", label: "Swim strokes", group: "activity", tone: "activity", unit: "", decimals: 0, series: { kind: "interval", dataType: "swim-lengths-data" }, agg: "sum",
    source: `${G} · swim-lengths-data (Fitbit Air)`, explanation: "Strokes in swim lengths detected by the Fitbit Air." },
  ...(["LIGHT", "MODERATE", "VIGOROUS", "PEAK"] as const).map((z) => ({ id: `google_zone_${z.toLowerCase()}`, label: `${z[0]}${z.slice(1).toLowerCase()} zone (Google)`, group: "activity" as const, tone: "heart" as const, unit: "min", decimals: 0,
    series: { kind: "interval" as const, dataType: "time-in-heart-rate-zone", variant: z }, agg: "sum" as const, source: `${G} · time-in-heart-rate-zone`,
    explanation: "Minutes in Google's heart-rate zone (40 / 60 / 85 % of heart-rate reserve)." })),
  ...(["light", "moderate", "vigorous", "peak"] as const).map((z) => ({ id: `kcal_zone_${z}`, label: `Energy in ${z} zone`, group: "activity" as const, tone: "activity" as const, unit: "kcal", decimals: 0,
    series: { kind: "daily" as const, metric: `kcal_hr_zone_${z}` }, agg: "sum" as const, estimate: true, source: `${G} · calories-in-heart-rate-zone`, explanation: `Energy burned while in Google's ${z} heart-rate zone.` })),

  // Body
  { id: "weight", label: "Weight", group: "body", tone: "body", unit: "kg", decimals: 1, series: { kind: "sample", dataType: "weight" }, agg: "mean", source: `${G} · weight`, explanation: "Body weight as logged in Fitbit / Google Health." },
  { id: "body_fat", label: "Body fat", group: "body", tone: "body", unit: "%", decimals: 1, series: { kind: "sample", dataType: "body-fat" }, agg: "mean", source: `${G} · body-fat`, explanation: "Body fat percentage from a connected scale or manual entry." },
  { id: "height", label: "Height", group: "body", tone: "body", unit: "m", decimals: 2, series: { kind: "sample", dataType: "height" }, agg: "mean", source: `${G} · height`, explanation: "Height from your profile entries." },
  { id: "blood_glucose", label: "Blood glucose", group: "body", tone: "body", unit: "mg/dL", decimals: 0, series: { kind: "sample", dataType: "blood-glucose" }, agg: "mean", source: `${G} · blood-glucose`, explanation: "Glucose readings from a connected meter or CGM." },
  { id: "core_temp", label: "Body temperature", group: "body", tone: "body", unit: "°C", decimals: 1, series: { kind: "sample", dataType: "core-body-temperature" }, agg: "mean", source: `${G} · core-body-temperature`, explanation: "Body temperature readings from a thermometer source." },
];

export const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]));
export const GROUP_LABEL: Record<MetricGroup, string> = {
  recovery: "Recovery", heart: "Heart", sleep: "Sleep", activity: "Activity", load: "Training load", vitals: "Vitals", body: "Body",
};
