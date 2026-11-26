import { describe, expect, it } from "vitest";
import { normalizeGoogle, parseDuration, parseDate, num, unionField, SUPPORTED_GOOGLE_TYPES } from "@/server/providers/google/normalize";
import { buildFilter, chunkWindows, GOOGLE_STREAMS } from "@/server/providers/google/streams";
import { dailyHrvPoint, dailyRhrPoint, exercisePoint, hrPoint, sleepPoint, stepsPoint, weightPoint } from "../fixtures/google";

describe("primitive parsers", () => {
  it("parses protobuf durations and int64 strings", () => {
    expect(parseDuration("3600s")).toBe(3600);
    expect(parseDuration("-1800s")).toBe(-1800);
    expect(parseDuration("3.5s")).toBe(3.5);
    expect(parseDuration("bogus")).toBeUndefined();
    expect(num("52")).toBe(52);
    expect(num("")).toBeUndefined();
    expect(num(null)).toBeUndefined();
  });
  it("parses Google Date messages", () => {
    expect(parseDate({ year: 2026, month: 3, day: 2 })).toBe("2026-03-02");
    expect(parseDate("2026-03-02")).toBe("2026-03-02");
    expect(parseDate({ year: 2026 })).toBeUndefined();
  });
  it("maps data types to union field names", () => {
    expect(unionField("heart-rate")).toBe("heartRate");
    expect(unionField("daily-vo2-max")).toBe("dailyVo2Max");
    expect(unionField("respiratory-rate-sleep-summary")).toBe("respiratoryRateSleepSummary");
  });
});

describe("normalizeGoogle", () => {
  it("heart rate: keeps provenance, offset and motion; rejects out-of-range", () => {
    const b = normalizeGoogle("heart-rate", [hrPoint("2026-03-02T17:00:00Z", 120), hrPoint("2026-03-02T17:00:05Z", 0), hrPoint("2026-03-02T17:00:10Z", "x")]);
    expect(b.hr).toHaveLength(1);
    expect(b.hr[0]).toMatchObject({ bpm: 120, utcOffsetS: 3600, motion: "ACTIVE", tMs: Date.UTC(2026, 2, 2, 17) });
    expect(b.hr[0]!.source).toMatchObject({ platform: "FITBIT", deviceName: "Fitbit Air" });
    expect(b.skipped).toBe(2);
  });

  it("steps (reconciled): interval, count, RECONCILED provenance", () => {
    const b = normalizeGoogle("steps", [stepsPoint("2026-03-02T08:00:00Z", "2026-03-02T08:01:00Z", 97)]);
    expect(b.obs[0]).toMatchObject({ dataType: "steps", value: 97, unit: "count", endMs: Date.UTC(2026, 2, 2, 8, 1) });
    expect(b.obs[0]!.source.platform).toBe("RECONCILED");
  });

  it("weight is converted from grams to kg", () => {
    expect(normalizeGoogle("weight", [weightPoint]).obs[0]).toMatchObject({ value: 78.4, unit: "kg" });
  });

  it("daily metrics: resting HR and multi-field HRV", () => {
    expect(normalizeGoogle("daily-resting-heart-rate", [dailyRhrPoint]).daily[0]).toMatchObject({ metric: "resting_hr", date: "2026-03-02", value: 52 });
    const hrv = normalizeGoogle("daily-heart-rate-variability", [dailyHrvPoint]).daily;
    expect(hrv.map((d) => d.metric).sort()).toEqual(["hrv_rmssd_daily", "hrv_rmssd_deep_sleep"]);
  });

  it("sleep sessions with stages and summary", () => {
    const b = normalizeGoogle("sleep", [sleepPoint]);
    expect(b.sleep[0]).toMatchObject({ id: "users/me/dataTypes/sleep/dataPoints/fixture-sleep-1", sleepType: "STAGES", isMain: true, isNap: false });
    expect(b.sleep[0]!.stages).toHaveLength(4);
  });

  it("exercise sessions", () => {
    const e = normalizeGoogle("exercise", [exercisePoint]).exercise[0]!;
    expect(e).toMatchObject({ exerciseType: "WEIGHTLIFTING", activeDurationS: 3500 });
    expect(e.metrics?.caloriesKcal).toBe(310);
  });

  it("skips points whose union field is missing (never fabricates zeros)", () => {
    const b = normalizeGoogle("steps", [{ heartRate: {} }]);
    expect(b.obs).toHaveLength(0);
    expect(b.skipped).toBe(1);
  });

  it("every configured stream has a normalizer", () => {
    for (const s of GOOGLE_STREAMS) expect(SUPPORTED_GOOGLE_TYPES).toContain(s.dataType);
  });
});

describe("filters & windows", () => {
  const a = Date.UTC(2026, 2, 1), b = Date.UTC(2026, 2, 2);
  it("builds AIP-160 filters per record kind", () => {
    expect(buildFilter({ dataType: "heart-rate", filter: "sample" }, a, b)).toBe(
      'heartRate.sample_time.physical_time >= "2026-03-01T00:00:00Z" AND heartRate.sample_time.physical_time < "2026-03-02T00:00:00Z"',
    );
    expect(buildFilter({ dataType: "steps", filter: "interval" }, a, b)).toContain("steps.interval.start_time >=");
    expect(buildFilter({ dataType: "sleep", filter: "sleep" }, a, b)).toContain("sleep.interval.end_time <");
    expect(buildFilter({ dataType: "daily-resting-heart-rate", filter: "daily" }, a, b)).toBe(
      'dailyRestingHeartRate.date >= "2026-03-01" AND dailyRestingHeartRate.date < "2026-03-02"',
    );
  });
  it("chunks windows without gaps or overlap", () => {
    const w = chunkWindows(a, a + 5 * 86_400_000 + 1000, 2);
    expect(w).toHaveLength(3);
    expect(w[1]![0]).toBe(w[0]![1]);
    expect(w[2]![1]).toBe(a + 5 * 86_400_000 + 1000);
  });
});
