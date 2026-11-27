import { describe, expect, it } from "vitest";
import { normalizeGoogle, normalizeGoogleDailyRollup, unionField } from "@/server/providers/google/normalize";
import { buildFilter, exerciseCivilWindow, filterName, GOOGLE_STREAMS, rollupRange, streamId } from "@/server/providers/google/streams";

/**
 * Regression table for every Google stream. Expected filter fields come from developers.google.com/health/filters
 * and were confirmed against a real account on 2026-11-26 (every stream returned HTTP 200).
 * The original bug: camelCase type names in filters ("heartRate.sample_time…") → HTTP 400 for 20 of 24 streams.
 * Values in fixtures below are FICTIONAL; only the field shapes mirror the observed responses.
 */
const EXPECTED: Record<string, { method: string; field: string | null; family?: string }> = {
  "heart-rate": { method: "list", field: "heart_rate.sample_time.physical_time", family: "google-wearables" },
  "heart-rate-variability": { method: "list", field: "heart_rate_variability.sample_time.physical_time", family: "google-wearables" },
  "oxygen-saturation": { method: "list", field: "oxygen_saturation.sample_time.physical_time", family: "google-wearables" },
  "respiratory-rate-sleep-summary": { method: "list", field: "respiratory_rate_sleep_summary.sample_time.physical_time" },
  sleep: { method: "reconcile", field: "sleep.interval.end_time" },
  exercise: { method: "list", field: "exercise.interval.civil_start_time" },
  steps: { method: "reconcile", field: "steps.interval.start_time" },
  distance: { method: "reconcile", field: "distance.interval.start_time" },
  "active-energy-burned": { method: "reconcile", field: "active_energy_burned.interval.start_time" },
  "basal-energy-burned": { method: "reconcile", field: "basal_energy_burned.interval.start_time" },
  "active-zone-minutes": { method: "reconcile", field: "active_zone_minutes.interval.start_time" },
  "active-minutes": { method: "reconcile", field: "active_minutes.interval.start_time" },
  "time-in-heart-rate-zone": { method: "reconcile", field: "time_in_heart_rate_zone.interval.start_time" },
  "activity-level": { method: "reconcile", field: "activity_level.interval.start_time" },
  "sedentary-period": { method: "reconcile", field: "sedentary_period.interval.start_time" },
  floors: { method: "reconcile", field: "floors.interval.start_time" },
  altitude: { method: "reconcile", field: "altitude.interval.start_time" },
  "swim-lengths-data": { method: "reconcile", field: "swim_lengths_data.interval.start_time" },
  "daily-resting-heart-rate": { method: "list", field: "daily_resting_heart_rate.date" },
  "daily-heart-rate-variability": { method: "list", field: "daily_heart_rate_variability.date" },
  "daily-oxygen-saturation": { method: "list", field: "daily_oxygen_saturation.date" },
  "daily-respiratory-rate": { method: "list", field: "daily_respiratory_rate.date" },
  "daily-sleep-temperature-derivations": { method: "list", field: "daily_sleep_temperature_derivations.date" },
  "daily-vo2-max": { method: "list", field: "daily_vo2_max.date" },
  "daily-heart-rate-zones": { method: "list", field: "daily_heart_rate_zones.date" },
  "total-calories:daily-rollup": { method: "dailyRollUp", field: null },
  "calories-in-heart-rate-zone:daily-rollup": { method: "dailyRollUp", field: null },
  "heart-rate:daily-rollup": { method: "dailyRollUp", field: null },
  weight: { method: "list", field: "weight.sample_time.physical_time" },
  "body-fat": { method: "list", field: "body_fat.sample_time.physical_time" },
  height: { method: "list", field: "height.sample_time.physical_time" },
  "vo2-max": { method: "list", field: "vo2_max.sample_time.physical_time" },
  "run-vo2-max": { method: "list", field: "run_vo2_max.sample_time.physical_time" },
  "blood-glucose": { method: "list", field: "blood_glucose.sample_time.physical_time" },
  "core-body-temperature": { method: "list", field: "core_body_temperature.sample_time.physical_time" },
};

const A = Date.UTC(2026, 2, 1), B = Date.UTC(2026, 2, 8);

describe("Google stream table", () => {
  it("covers exactly the expected streams (none silently dropped)", () => {
    expect(GOOGLE_STREAMS.map(streamId).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const s of GOOGLE_STREAMS) {
    const id = streamId(s);
    it(`${id}: method, family and filter field`, () => {
      const exp = EXPECTED[id]!;
      expect(s.method).toBe(exp.method);
      expect(s.family).toBe(exp.family);
      if (exp.field === null) {
        expect(() => buildFilter(s, A, B)).toThrow(/rollup/);
        return;
      }
      const f = buildFilter(s, A, B, "Europe/Brussels");
      // Exactly two restrictions on the documented field, joined by AND, with only >= and <.
      expect(f).toMatch(new RegExp(`^${exp.field.replace(/\./g, "\\.")} >= "[^"]+" AND ${exp.field.replace(/\./g, "\\.")} < "[^"]+"$`));
      // No hyphens or camelCase in the field part (the original bug).
      const fieldPart = f.split(" ")[0]!;
      expect(fieldPart).not.toMatch(/-|[A-Z]/);
      // Literal formats: physical → RFC 3339 with Z; daily/civil → YYYY-MM-DD.
      const lits = [...f.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
      if (/physical_time|\.start_time|\.end_time/.test(exp.field)) lits.forEach((l) => expect(l).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/));
      else lits.forEach((l) => expect(l).toMatch(/^\d{4}-\d{2}-\d{2}$/));
    });
  }

  it("session page sizes respect the API max of 25; rollup chunks respect the 14-day range limit", () => {
    for (const s of GOOGLE_STREAMS) {
      if (s.dataType === "sleep" || s.dataType === "exercise") expect(s.pageSize).toBeLessThanOrEqual(25);
      if (s.method === "dailyRollUp") { expect(s.chunkDays).toBeLessThanOrEqual(14); expect(s.pageSize).toBeLessThanOrEqual(14); }
      expect(s.pageSize).toBeLessThanOrEqual(10000);
    }
  });

  it("filterName is snake_case, unionField is camelCase", () => {
    expect(filterName("respiratory-rate-sleep-summary")).toBe("respiratory_rate_sleep_summary");
    expect(unionField("swim-lengths-data")).toBe("swimLengthsData");
  });

  it("exercise civil window uses home-zone dates (UTC 23:30 on Mar 1 is Mar 2 in Brussels)", () => {
    expect(exerciseCivilWindow(Date.UTC(2026, 2, 1, 23, 30), Date.UTC(2026, 2, 3), "Europe/Brussels")).toEqual(["2026-03-02", "2026-03-03"]);
    expect(rollupRange(A, B)).toEqual(["2026-03-01", "2026-03-08"]);
  });
});

// ---- Normalizers for every type, using the field shapes observed in real responses (values fictional) ----
const ivl = { startTime: "2026-03-02T08:00:00Z", startUtcOffset: "3600s", endTime: "2026-03-02T08:01:00Z", endUtcOffset: "3600s" };
const st = { physicalTime: "2026-03-02T03:00:00Z", utcOffset: "3600s" };
const day = { year: 2026, month: 3, day: 2 };
const fitbit = { platform: "FITBIT", recordingMethod: "DERIVED", device: { formFactor: "FITNESS_BAND", displayName: "Fitbit Air" } };

describe("normalizers for every list/reconcile type", () => {
  const cases: [string, Record<string, unknown>, (b: ReturnType<typeof normalizeGoogle>) => void][] = [
    ["heart-rate-variability", { heartRateVariability: { sampleTime: st, rootMeanSquareOfSuccessiveDifferencesMilliseconds: 42.5, metadata: { lowFrequencyPower: 1.5, highFrequencyPower: 2.5 } } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 42.5, unit: "ms", attrs: { lfPower: 1.5, hfPower: 2.5 } })],
    ["oxygen-saturation", { oxygenSaturation: { sampleTime: st, percentage: 96 } }, (b) => expect(b.obs[0]).toMatchObject({ value: 96, unit: "%" })],
    ["respiratory-rate-sleep-summary", { respiratoryRateSleepSummary: { sampleTime: st, fullSleepStats: { breathsPerMinute: 14.1, standardDeviation: 0.8 }, deepSleepStats: { breathsPerMinute: 13 } } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 14.1, attrs: { deep: 13, sd: 0.8 } })],
    ["height", { height: { sampleTime: st, heightMillimeters: "1800" } }, (b) => expect(b.obs[0]).toMatchObject({ value: 1.8, unit: "m" })],
    ["body-fat", { bodyFat: { sampleTime: st, percentage: 18 } }, (b) => expect(b.obs[0]).toMatchObject({ value: 18, unit: "%" })],
    ["vo2-max", { vo2Max: { sampleTime: st, vo2Max: 48 } }, (b) => expect(b.obs[0]).toMatchObject({ value: 48 })],
    ["run-vo2-max", { runVo2Max: { sampleTime: st, runVo2Max: 50 } }, (b) => expect(b.obs[0]).toMatchObject({ value: 50 })],
    ["blood-glucose", { bloodGlucose: { sampleTime: st, bloodGlucoseMilligramsPerDeciliter: 95, mealType: "BREAKFAST" } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 95, unit: "mg/dL", attrs: { meal: "BREAKFAST" } })],
    ["core-body-temperature", { coreBodyTemperature: { sampleTime: st, temperatureCelsius: 36.8, measurementLocation: "WRIST" } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 36.8, unit: "°C", attrs: { location: "WRIST" } })],
    ["distance", { distance: { interval: ivl, millimeters: "75000" } }, (b) => expect(b.obs[0]).toMatchObject({ value: 75, unit: "m" })],
    ["active-energy-burned", { activeEnergyBurned: { interval: ivl, kcal: 3.2 } }, (b) => expect(b.obs[0]).toMatchObject({ value: 3.2, unit: "kcal" })],
    ["basal-energy-burned", { basalEnergyBurned: { interval: ivl, kcal: 1.1 } }, (b) => expect(b.obs[0]).toMatchObject({ value: 1.1, unit: "kcal" })],
    ["active-zone-minutes", { activeZoneMinutes: { interval: ivl, activeZoneMinutes: "2", heartRateZone: "CARDIO" } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 2, variant: "CARDIO" })],
    ["active-minutes", { activeMinutes: { interval: ivl, activeMinutesByActivityLevel: [{ activityLevel: "LIGHT", activeMinutes: "1" }] } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 1, variant: "LIGHT", unit: "min" })],
    ["time-in-heart-rate-zone", { timeInHeartRateZone: { interval: ivl, heartRateZoneType: "MODERATE" } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 1, variant: "MODERATE", unit: "min" })],
    ["activity-level", { activityLevel: { interval: ivl, activityLevelType: "SEDENTARY" } }, (b) => expect(b.obs[0]).toMatchObject({ value: 1, variant: "SEDENTARY" })],
    ["sedentary-period", { sedentaryPeriod: { interval: ivl } }, (b) => expect(b.obs[0]).toMatchObject({ value: 1, unit: "min" })],
    ["floors", { floors: { interval: ivl, count: "2" } }, (b) => expect(b.obs[0]).toMatchObject({ value: 2, unit: "count" })],
    ["altitude", { altitude: { interval: ivl, gainMillimeters: "3000" } }, (b) => expect(b.obs[0]).toMatchObject({ value: 3, unit: "m" })],
    ["swim-lengths-data", { swimLengthsData: { interval: ivl, strokeCount: "18", swimStrokeType: "FREESTYLE" } },
      (b) => expect(b.obs[0]).toMatchObject({ value: 18, unit: "strokes", variant: "FREESTYLE" })],
    ["daily-oxygen-saturation", { dailyOxygenSaturation: { date: day, averagePercentage: 96, lowerBoundPercentage: 94, upperBoundPercentage: 98 } },
      (b) => expect(b.daily[0]).toMatchObject({ metric: "spo2_avg", value: 96, attrs: { lower: 94, upper: 98 } })],
    ["daily-respiratory-rate", { dailyRespiratoryRate: { date: day, breathsPerMinute: 14 } }, (b) => expect(b.daily[0]).toMatchObject({ metric: "respiratory_rate", value: 14 })],
    ["daily-sleep-temperature-derivations", { dailySleepTemperatureDerivations: { date: day, nightlyTemperatureCelsius: 34.2, baselineTemperatureCelsius: 34.0, relativeNightlyStddev30dCelsius: 0.3 } },
      (b) => { expect(b.daily.find((d) => d.metric === "skin_temp_deviation")!.value).toBeCloseTo(0.2); }],
    ["daily-vo2-max", { dailyVo2Max: { date: day, vo2Max: 47, cardioFitnessLevel: "GOOD" } }, (b) => expect(b.daily[0]).toMatchObject({ metric: "vo2max", value: 47 })],
    ["daily-heart-rate-zones", { dailyHeartRateZones: { date: day, heartRateZones: [{ heartRateZoneType: "LIGHT", minBeatsPerMinute: "98", maxBeatsPerMinute: "122" }] } },
      (b) => expect(b.daily.map((d) => d.metric).sort()).toEqual(["hr_zone_light_max", "hr_zone_light_min"])],
    ["daily-heart-rate-variability", { dailyHeartRateVariability: { date: day, averageHeartRateVariabilityMilliseconds: 50, entropy: 2.1, nonRemHeartRateBeatsPerMinute: 55 } },
      (b) => expect(b.daily.map((d) => d.metric).sort()).toEqual(["hr_non_rem", "hrv_entropy", "hrv_rmssd_daily"])],
  ];
  for (const [type, point, check] of cases) {
    it(type, () => {
      const b = normalizeGoogle(type, [{ dataSource: fitbit, ...point }]);
      expect(b.skipped).toBe(0);
      check(b);
    });
  }

  it("a reconciled exercise uses dataPointName as id; list uses name", () => {
    const ex = { interval: ivl, exerciseType: "WALKING" };
    expect(normalizeGoogle("exercise", [{ dataPointName: "users/me/dataTypes/exercise/dataPoints/r1", exercise: ex }]).exercise[0]!.id).toContain("r1");
    expect(normalizeGoogle("exercise", [{ name: "users/me/dataTypes/exercise/dataPoints/l1", dataSource: fitbit, exercise: ex }]).exercise[0]!.id).toContain("l1");
  });
});

describe("daily rollup normalizer", () => {
  const civil = { civilStartTime: { date: day }, civilEndTime: { date: { year: 2026, month: 3, day: 3 } } };
  it("total calories", () => {
    expect(normalizeGoogleDailyRollup("total-calories", [{ ...civil, totalCalories: { kcalSum: 2400.5 } }]).daily[0])
      .toMatchObject({ metric: "total_kcal", date: "2026-03-02", value: 2400.5, unit: "kcal", source: { platform: "ROLLUP" } });
  });
  it("calories per heart-rate zone", () => {
    const d = normalizeGoogleDailyRollup("calories-in-heart-rate-zone", [{ ...civil, caloriesInHeartRateZone: { caloriesInHeartRateZones: [{ heartRateZone: "LIGHT", kcal: 300 }, { heartRateZone: "PEAK", kcal: 0 }] } }]).daily;
    expect(d.map((x) => [x.metric, x.value])).toEqual([["kcal_hr_zone_light", 300], ["kcal_hr_zone_peak", 0]]);
  });
  it("heart-rate min/avg/max", () => {
    const d = normalizeGoogleDailyRollup("heart-rate", [{ ...civil, heartRate: { beatsPerMinuteAvg: 70, beatsPerMinuteMin: 48, beatsPerMinuteMax: 160 } }]).daily;
    expect(Object.fromEntries(d.map((x) => [x.metric, x.value]))).toEqual({ hr_day_avg: 70, hr_day_min: 48, hr_day_max: 160 });
  });
  it("a day without a value field yields no row (missing ≠ 0)", () => {
    const b = normalizeGoogleDailyRollup("total-calories", [civil]);
    expect(b.daily).toHaveLength(0);
    expect(b.skipped).toBe(0);
  });
});
