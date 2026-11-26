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
    expect(d.baseline).toMatchObject({ calibrating: true, have: 3, need: 14 });
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
