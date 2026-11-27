/**
 * Pure normalizers: Google Health API v4 data points → provider-neutral rows.
 * Field names follow developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints.
 * Units are normalized: distance → m, mass → kg, energy → kcal, durations → s / min (stated per row).
 * Unknown or malformed points are skipped and counted, never coerced to zero.
 */

export interface SourceDescriptor {
  provider: "google" | "hevy" | "baseline";
  platform?: string;
  recordingMethod?: string;
  deviceFormFactor?: string;
  deviceManufacturer?: string;
  deviceName?: string;
  appPackage?: string;
}

export interface HrRow { source: SourceDescriptor; tMs: number; utcOffsetS: number | null; bpm: number; motion: string | null }
export interface ObsRow {
  source: SourceDescriptor; dataType: string; startMs: number; endMs: number; variant: string;
  utcOffsetS: number | null; value: number; unit: string; attrs?: Record<string, unknown>; recordName?: string;
}
export interface DailyRow { source: SourceDescriptor; metric: string; date: string; value: number; unit: string; attrs?: Record<string, unknown> }
export interface SleepRow {
  source: SourceDescriptor; id: string; startMs: number; endMs: number; startOffsetS: number | null; endOffsetS: number | null;
  sleepType: string | null; isMain: boolean | null; isNap: boolean | null; stagesStatus: string | null;
  summary: Record<string, unknown> | null; updatedAt: number | null;
  stages: { startMs: number; endMs: number; stage: string; isShortAwakening: boolean }[];
}
export interface ExerciseRow {
  source: SourceDescriptor; id: string; startMs: number; endMs: number; startOffsetS: number | null; exerciseType: string;
  displayName: string | null; activeDurationS: number | null; metrics: Record<string, unknown> | null;
}

export interface NormalizedBatch { hr: HrRow[]; obs: ObsRow[]; daily: DailyRow[]; sleep: SleepRow[]; exercise: ExerciseRow[]; skipped: number }

export const emptyBatch = (): NormalizedBatch => ({ hr: [], obs: [], daily: [], sleep: [], exercise: [], skipped: 0 });

type J = Record<string, unknown>;
const obj = (v: unknown): J | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Numbers arrive as JSON numbers or (int64) strings. Returns undefined for absent/invalid. */
export function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Protobuf Duration JSON ("3600s", "3.5s", "-3600s") → seconds. */
export function parseDuration(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(v.trim());
  return m ? Number(m[1]) : undefined;
}

export function parseTime(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

/** Google `Date` message ({year, month, day}) or "YYYY-MM-DD" → "YYYY-MM-DD". */
export function parseDate(v: unknown): string | undefined {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const o = obj(v);
  const y = num(o?.year), m = num(o?.month), d = num(o?.day);
  if (!y || !m || !d) return undefined;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function sourceFromDataPoint(dp: J): SourceDescriptor {
  const ds = obj(dp.dataSource);
  if (!ds) return { provider: "google", platform: "RECONCILED" }; // reconcile responses omit dataSource
  const device = obj(ds.device);
  const app = obj(ds.application);
  return {
    provider: "google",
    platform: str(ds.platform),
    recordingMethod: str(ds.recordingMethod),
    deviceFormFactor: str(device?.formFactor),
    deviceManufacturer: str(device?.manufacturer),
    deviceName: str(device?.displayName),
    appPackage: str(app?.packageName),
  };
}

export function sourceKey(s: SourceDescriptor): string {
  return [s.platform, s.recordingMethod, s.deviceFormFactor, s.deviceManufacturer, s.deviceName, s.appPackage].map((x) => x ?? "").join("|");
}

function sampleTime(v: unknown) {
  const o = obj(v);
  const t = parseTime(o?.physicalTime);
  if (t === undefined) return undefined;
  return { t, offset: parseDuration(o?.utcOffset) ?? null };
}

function interval(v: unknown) {
  const o = obj(v);
  const s = parseTime(o?.startTime), e = parseTime(o?.endTime);
  if (s === undefined || e === undefined || e < s) return undefined;
  return { s, e, so: parseDuration(o?.startUtcOffset) ?? null, eo: parseDuration(o?.endUtcOffset) ?? null };
}

const recordName = (dp: J) => str(dp.name) ?? str(dp.dataPointName);

/** camelCase union-field name for a kebab-case data type ("heart-rate" → "heartRate"). */
export const unionField = (dataType: string) => dataType.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

type SampleSpec = { field: (p: J) => unknown; unit: string; scale?: number; attrs?: (p: J) => Record<string, unknown> };
const SAMPLE_TYPES: Record<string, SampleSpec> = {
  "heart-rate-variability": {
    field: (p) => p.rootMeanSquareOfSuccessiveDifferencesMilliseconds, unit: "ms",
    attrs: (p) => ({
      sdnnMs: num(p.standardDeviationMilliseconds),
      lfPower: num(obj(p.metadata)?.lowFrequencyPower), hfPower: num(obj(p.metadata)?.highFrequencyPower),
    }),
  },
  "oxygen-saturation": { field: (p) => p.percentage, unit: "%" },
  "respiratory-rate-sleep-summary": {
    field: (p) => obj(p.fullSleepStats)?.breathsPerMinute, unit: "breaths/min",
    attrs: (p) => ({
      deep: num(obj(p.deepSleepStats)?.breathsPerMinute), light: num(obj(p.lightSleepStats)?.breathsPerMinute),
      rem: num(obj(p.remSleepStats)?.breathsPerMinute), signalToNoise: num(obj(p.fullSleepStats)?.signalToNoise),
      sd: num(obj(p.fullSleepStats)?.standardDeviation),
    }),
  },
  weight: { field: (p) => p.weightGrams, unit: "kg", scale: 1 / 1000 },
  "body-fat": { field: (p) => p.percentage, unit: "%" },
  height: { field: (p) => p.heightMillimeters, unit: "m", scale: 1 / 1000 },
  "vo2-max": { field: (p) => p.vo2Max, unit: "mL/kg/min", attrs: (p) => ({ method: str(p.measurementMethod) }) },
  "run-vo2-max": { field: (p) => p.runVo2Max, unit: "mL/kg/min" },
  "blood-glucose": {
    field: (p) => p.bloodGlucoseMilligramsPerDeciliter, unit: "mg/dL",
    attrs: (p) => ({ source: str(p.measurementSource), meal: str(p.mealType), timing: str(p.measurementTiming), specimen: str(p.specimen) }),
  },
  "core-body-temperature": { field: (p) => p.temperatureCelsius, unit: "°C", attrs: (p) => ({ location: str(p.measurementLocation) }) },
};

type IntervalSpec = { values: (p: J, durationMin: number) => { value: number | undefined; variant?: string }[]; unit: string };
const INTERVAL_TYPES: Record<string, IntervalSpec> = {
  steps: { unit: "count", values: (p) => [{ value: num(p.count) }] },
  floors: { unit: "count", values: (p) => [{ value: num(p.count) }] },
  distance: { unit: "m", values: (p) => [{ value: mul(num(p.millimeters), 1 / 1000) }] },
  altitude: { unit: "m", values: (p) => [{ value: mul(num(p.gainMillimeters), 1 / 1000) }] },
  "active-energy-burned": { unit: "kcal", values: (p) => [{ value: num(p.kcal) }] },
  "basal-energy-burned": { unit: "kcal", values: (p) => [{ value: num(p.kcal) }] },
  "active-zone-minutes": { unit: "AZM", values: (p) => [{ value: num(p.activeZoneMinutes), variant: str(p.heartRateZone) }] },
  "active-minutes": {
    unit: "min",
    values: (p) => arr(p.activeMinutesByActivityLevel).map((x) => ({ value: num(obj(x)?.activeMinutes), variant: str(obj(x)?.activityLevel) })),
  },
  "time-in-heart-rate-zone": { unit: "min", values: (p, d) => [{ value: d, variant: str(p.heartRateZoneType) }] },
  "sedentary-period": { unit: "min", values: (_p, d) => [{ value: d }] },
  "activity-level": { unit: "min", values: (p, d) => [{ value: d, variant: str(p.activityLevelType) }] },
  "swim-lengths-data": { unit: "strokes", values: (p) => [{ value: num(p.strokeCount), variant: str(p.swimStrokeType) }] },
};
const mul = (v: number | undefined, f: number) => (v === undefined ? undefined : v * f);

type DailySpec = { rows: (p: J) => { metric: string; value: number | undefined; unit: string; attrs?: Record<string, unknown> }[] };
const DAILY_TYPES: Record<string, DailySpec> = {
  "daily-resting-heart-rate": {
    rows: (p) => [{ metric: "resting_hr", value: num(p.beatsPerMinute), unit: "bpm", attrs: { method: str(obj(p.dailyRestingHeartRateMetadata)?.calculationMethod) } }],
  },
  "daily-heart-rate-variability": {
    rows: (p) => [
      { metric: "hrv_rmssd_daily", value: num(p.averageHeartRateVariabilityMilliseconds), unit: "ms" },
      { metric: "hrv_rmssd_deep_sleep", value: num(p.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds), unit: "ms" },
      { metric: "hr_non_rem", value: num(p.nonRemHeartRateBeatsPerMinute), unit: "bpm" },
      { metric: "hrv_entropy", value: num(p.entropy), unit: "" },
    ],
  },
  "daily-oxygen-saturation": {
    rows: (p) => [{
      metric: "spo2_avg", value: num(p.averagePercentage), unit: "%",
      attrs: { lower: num(p.lowerBoundPercentage), upper: num(p.upperBoundPercentage), sd: num(p.standardDeviationPercentage) },
    }],
  },
  "daily-respiratory-rate": { rows: (p) => [{ metric: "respiratory_rate", value: num(p.breathsPerMinute), unit: "breaths/min" }] },
  "daily-sleep-temperature-derivations": {
    rows: (p) => {
      const n = num(p.nightlyTemperatureCelsius), b = num(p.baselineTemperatureCelsius);
      return [
        { metric: "skin_temp_nightly", value: n, unit: "°C", attrs: { baseline: b, stddev30d: num(p.relativeNightlyStddev30dCelsius) } },
        { metric: "skin_temp_deviation", value: n !== undefined && b !== undefined ? n - b : undefined, unit: "°C" },
      ];
    },
  },
  "daily-vo2-max": {
    rows: (p) => [{ metric: "vo2max", value: num(p.vo2Max), unit: "mL/kg/min", attrs: { estimated: p.estimated, level: str(p.cardioFitnessLevel), covariance: num(p.vo2MaxCovariance) } }],
  },
  "daily-heart-rate-zones": {
    rows: (p) =>
      arr(p.heartRateZones).flatMap((z) => {
        const o = obj(z);
        const type = str(o?.heartRateZoneType)?.toLowerCase();
        if (!type) return [];
        return [
          { metric: `hr_zone_${type}_min`, value: num(o?.minBeatsPerMinute), unit: "bpm" },
          { metric: `hr_zone_${type}_max`, value: num(o?.maxBeatsPerMinute), unit: "bpm" },
        ];
      }),
  },
};

export const SUPPORTED_GOOGLE_TYPES = [
  "heart-rate", "sleep", "exercise", ...Object.keys(SAMPLE_TYPES), ...Object.keys(INTERVAL_TYPES), ...Object.keys(DAILY_TYPES),
];

export function normalizeGoogle(dataType: string, dataPoints: J[]): NormalizedBatch {
  const out = emptyBatch();
  const field = unionField(dataType);
  for (const dp of dataPoints) {
    const p = obj(dp[field]);
    if (!p) { out.skipped++; continue; }
    const source = sourceFromDataPoint(dp);

    if (dataType === "heart-rate") {
      const st = sampleTime(p.sampleTime), bpm = num(p.beatsPerMinute);
      if (!st || bpm === undefined || bpm < 1 || bpm > 300) { out.skipped++; continue; }
      out.hr.push({ source, tMs: st.t, utcOffsetS: st.offset, bpm: Math.round(bpm), motion: str(obj(p.metadata)?.motionContext) ?? null });
      continue;
    }

    const sample = SAMPLE_TYPES[dataType];
    if (sample) {
      const st = sampleTime(p.sampleTime), raw = num(sample.field(p));
      if (!st || raw === undefined) { out.skipped++; continue; }
      out.obs.push({ source, dataType, startMs: st.t, endMs: st.t, variant: "", utcOffsetS: st.offset, value: raw * (sample.scale ?? 1), unit: sample.unit, attrs: sample.attrs?.(p), recordName: recordName(dp) });
      continue;
    }

    const iv = INTERVAL_TYPES[dataType];
    if (iv) {
      const t = interval(p.interval);
      if (!t) { out.skipped++; continue; }
      const durMin = (t.e - t.s) / 60_000;
      for (const v of iv.values(p, durMin)) {
        if (v.value === undefined) { out.skipped++; continue; }
        out.obs.push({ source, dataType, startMs: t.s, endMs: t.e, variant: v.variant ?? "", utcOffsetS: t.so, value: v.value, unit: iv.unit, recordName: recordName(dp) });
      }
      continue;
    }

    const daily = DAILY_TYPES[dataType];
    if (daily) {
      const date = parseDate(p.date);
      if (!date) { out.skipped++; continue; }
      for (const r of daily.rows(p)) {
        if (r.value === undefined) continue; // field not provided — not an error
        out.daily.push({ source, metric: r.metric, date, value: r.value, unit: r.unit, attrs: r.attrs });
      }
      continue;
    }

    if (dataType === "sleep") {
      const t = interval(p.interval), id = recordName(dp);
      if (!t || !id) { out.skipped++; continue; }
      const meta = obj(p.metadata);
      const stage = (x: unknown, short: boolean) => {
        const o = obj(x), s = parseTime(o?.startTime), e = parseTime(o?.endTime), type = str(o?.type);
        return s !== undefined && e !== undefined && type ? [{ startMs: s, endMs: e, stage: type, isShortAwakening: short }] : [];
      };
      out.sleep.push({
        source, id, startMs: t.s, endMs: t.e, startOffsetS: t.so, endOffsetS: t.eo,
        sleepType: str(p.type) ?? null, isMain: typeof meta?.mainSleep === "boolean" ? meta.mainSleep : null,
        isNap: typeof meta?.nap === "boolean" ? meta.nap : null, stagesStatus: str(meta?.stagesStatus) ?? null,
        summary: obj(p.summary) ?? null, updatedAt: parseTime(p.updateTime) ?? null,
        stages: [...arr(p.stages).flatMap((x) => stage(x, false)), ...arr(p.shortAwakenings).flatMap((x) => stage(x, true))],
      });
      continue;
    }

    if (dataType === "exercise") {
      const t = interval(p.interval), id = recordName(dp), type = str(p.exerciseType);
      if (!t || !id || !type) { out.skipped++; continue; }
      out.exercise.push({
        source, id, startMs: t.s, endMs: t.e, startOffsetS: t.so, exerciseType: type, displayName: str(p.displayName) ?? null,
        activeDurationS: parseDuration(p.activeDuration) ?? null, metrics: obj(p.metricsSummary) ?? null,
      });
      continue;
    }

    out.skipped++;
  }
  return out;
}

/** Rollups have no dataSource; they are Google's own cross-source daily aggregate. */
export const ROLLUP_SOURCE: SourceDescriptor = { provider: "google", platform: "ROLLUP" };

type RollupSpec = (v: J) => { metric: string; value: number | undefined; unit: string }[];
const ROLLUP_TYPES: Record<string, RollupSpec> = {
  "total-calories": (v) => [{ metric: "total_kcal", value: num(v.kcalSum), unit: "kcal" }],
  "calories-in-heart-rate-zone": (v) =>
    arr(v.caloriesInHeartRateZones).flatMap((z) => {
      const o = obj(z), zone = str(o?.heartRateZone)?.toLowerCase();
      return zone ? [{ metric: `kcal_hr_zone_${zone}`, value: num(o?.kcal), unit: "kcal" }] : [];
    }),
  "heart-rate": (v) => [
    { metric: "hr_day_avg", value: num(v.beatsPerMinuteAvg), unit: "bpm" },
    { metric: "hr_day_min", value: num(v.beatsPerMinuteMin), unit: "bpm" },
    { metric: "hr_day_max", value: num(v.beatsPerMinuteMax), unit: "bpm" },
  ],
};
export const SUPPORTED_ROLLUP_TYPES = Object.keys(ROLLUP_TYPES);

/**
 * dailyRollUp points → daily rows. The civil day is `civilStartTime.date`. A missing value field means nothing was
 * measured that day (per the API reference) → no row, never 0. A present 0 is kept (device worn, nothing recorded).
 */
export function normalizeGoogleDailyRollup(dataType: string, points: J[]): NormalizedBatch {
  const out = emptyBatch();
  const spec = ROLLUP_TYPES[dataType];
  const field = unionField(dataType);
  for (const p of points) {
    const date = parseDate(obj(obj(p.civilStartTime))?.date);
    if (!spec || !date) { out.skipped++; continue; }
    const v = obj(p[field]);
    if (!v) continue; // no data that day — not an error
    for (const r of spec(v)) if (r.value !== undefined) out.daily.push({ source: ROLLUP_SOURCE, date, ...r, value: r.value });
  }
  return out;
}
