import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DB } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { writeBatch } from "@/server/store";
import { emptyBatch, type SourceDescriptor } from "@/server/providers/google/normalize";
import { computeDerived, datesNeedingDerive } from "@/server/analytics/derive";
import { metricDetail, metricSeries } from "@/server/analytics/values";
import { METRIC_BY_ID, METRICS } from "@/server/analytics/registry";
import { setSetting } from "@/server/settings";
import { computeScores } from "@/server/analytics/scores";

// FICTIONAL data only.
const TZ = "Europe/Brussels", FB = 3600;
const fitbit: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Fitbit Air" };
let db: DB;
beforeEach(() => { db = openDatabase(":memory:"); setSetting(db, "profileAge", 30); });

function hrDay(date: string, bpm: number, minutes: number) {
  const b = emptyBatch();
  const start = Date.parse(`${date}T09:00:00Z`);
  for (let i = 0; i < (minutes * 60) / 3; i++) b.hr.push({ source: fitbit, tMs: start + i * 3000, utcOffsetS: 3600, bpm, motion: null });
  writeBatch(db, b, null);
}
function daily(metric: string, date: string, value: number) {
  const b = emptyBatch(); b.daily.push({ source: fitbit, metric, date, value, unit: "" }); writeBatch(db, b, null);
}

describe("derived daily metrics", () => {
  it("computes Edwards TRIMP and zones from stored HR with Google's HRmax model", () => {
    hrDay("2026-03-02", 133, 30); // 70 % of 190 → Z3
    expect(datesNeedingDerive(db, "2026-03-03", 1, FB)).toEqual(["2026-03-02", "2026-03-03"]);
    computeDerived(db, ["2026-03-02", "2026-03-03"], TZ);
    const rows = db.select().from(t.derivedDaily).all();
    const get = (m: string) => rows.find((r) => r.metric === m && r.date === "2026-03-02");
    expect(get("zone3_min")!.value).toBeCloseTo(30, 0);
    expect(get("load_trimp")!.value).toBeCloseTo(91.5, 0); // 30 min × 3, plus the last sample counted up to the 30 s cap
    expect(get("load_trimp")!.attrs).toMatchObject({ hrMax: 190, hrMaxSource: "google-220-age" });
    expect(rows.some((r) => r.date === "2026-03-03")).toBe(false); // no HR → no rows, not zeros
  });
});

describe("metric series & detail", () => {
  it("averages only days with data and compares with the previous period", () => {
    daily("resting_hr", "2026-03-01", 50); daily("resting_hr", "2026-03-03", 54);
    daily("resting_hr", "2026-02-25", 60);
    const d = metricDetail(db, "resting_hr", "7d", "2026-03-07", FB)!;
    expect(d.points).toHaveLength(7);
    expect(d.points.filter((p) => p.value === null)).toHaveLength(5);
    expect(d.period).toMatchObject({ value: 52, days: 2, min: 50, max: 54 });
    expect(d.previous.value).toBe(60);
    expect(d.change!.abs).toBe(-8);
    expect(d.baseline).toMatchObject({ status: "calibrating", have: 3, need: 14 });
  });
  it("every registered metric resolves without error on an empty database", () => {
    for (const m of METRICS) expect(() => metricDetail(db, m.id, "30d", "2026-03-07", FB)).not.toThrow();
  });
  it("recovery stays 'calibrating' with fewer than 14 baseline days", () => {
    for (let d = 1; d <= 5; d++) { daily("hrv_rmssd_daily", `2026-03-0${d}`, 50); daily("resting_hr", `2026-03-0${d}`, 55); }
    const s = computeScores(db, "2026-03-05", "2026-03-05", FB).get("2026-03-05")!;
    expect(s.recovery.status).toBe("calibrating");
    expect(metricSeries(db, METRIC_BY_ID.get("recovery")!, "2026-03-01", "2026-03-05", FB).size).toBe(0);
  });
});

describe("audit 2026-11: partial days and newly exposed Google data", () => {
  it("today's partial total is shown but left out of averages, comparisons and baselines", () => {
    const today = new Date(Date.now() + FB * 1000).toISOString().slice(0, 10);
    const day = (o: number) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
    const b = emptyBatch();
    for (const [o, v] of [[-2, 10000], [-1, 8000], [0, 500]] as const) {
      const s = Date.parse(`${day(o)}T08:00:00Z`);
      b.obs.push({ source: fitbit, dataType: "steps", startMs: s, endMs: s + 60_000, variant: "", utcOffsetS: FB, value: v, unit: "count" });
    }
    writeBatch(db, b, null);
    const d = metricDetail(db, "steps", "7d", today, FB)!;
    expect(d.latest).toMatchObject({ date: today, value: 500, partial: true });
    expect(d.period).toMatchObject({ value: 9000, days: 2 });
    expect(d.points.at(-1)).toMatchObject({ value: 500, partial: true });
    // Non-additive metrics are complete as soon as they exist.
    daily("resting_hr", today, 55);
    expect(metricDetail(db, "resting_hr", "7d", today, FB)!.latest!.partial).toBe(false);
  });
  it("night samples are attributed to the wake date even when the night crosses midnight", () => {
    const b = emptyBatch();
    const start = Date.parse("2026-03-01T22:00:00Z"), end = Date.parse("2026-03-02T06:00:00Z");
    b.sleep.push({ source: fitbit, id: "n1", startMs: start, endMs: end, startOffsetS: FB, endOffsetS: FB, sleepType: "STAGES", isMain: true, isNap: false,
      stagesStatus: "SUCCEEDED", updatedAt: end, stages: [], summary: { minutesAsleep: "450" } });
    for (const [t, deep] of [[start + 30 * 60_000, 13], [end - 60 * 60_000, 15]] as const)
      b.obs.push({ source: fitbit, dataType: "respiratory-rate-sleep-summary", startMs: t, endMs: t, variant: "", utcOffsetS: FB, value: 14, unit: "breaths/min", attrs: { deep } });
    b.daily.push({ source: fitbit, metric: "spo2_avg", date: "2026-03-02", value: 96, unit: "%", attrs: { lower: 92.5 } });
    writeBatch(db, b, null);
    const resp = metricSeries(db, METRIC_BY_ID.get("resp_deep")!, "2026-03-01", "2026-03-02", FB);
    expect([...resp]).toEqual([["2026-03-02", 14]]);
    expect(metricSeries(db, METRIC_BY_ID.get("spo2_low")!, "2026-03-01", "2026-03-02", FB).get("2026-03-02")).toBe(92.5);
  });
});
