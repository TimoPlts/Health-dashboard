import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DB } from "@/server/db/client";
import { writeBatch } from "@/server/store";
import { emptyBatch, type SourceDescriptor } from "@/server/providers/google/normalize";
import { addManualWeight, deleteManualWeight, listWeights } from "@/server/weight";
import { bodyView } from "@/server/analytics/body";
import { reportView } from "@/server/analytics/reports";
import { associationsView } from "@/server/analytics/associations";
import { createHabit, setEntry } from "@/server/journal";
import { EMPTY_GOALS, setSetting } from "@/server/settings";

// FICTIONAL data only.
const TZ = "Europe/Brussels", FB = 3600, DAY = 86_400_000;
const scale: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Scale" };
const fitbit: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Fitbit Air" };
let db: DB;
beforeEach(() => { db = openDatabase(":memory:"); });
const at = (d: string, h = 7) => Date.parse(`${d}T0${h}:00:00Z`);

describe("manual weight (R5)", () => {
  it("adds, refuses duplicates of manual or Google entries, and deletes manual entries only", () => {
    const b = emptyBatch();
    b.obs.push({ source: scale, dataType: "weight", startMs: at("2026-03-02"), endMs: at("2026-03-02"), variant: "", utcOffsetS: FB, value: 80.0, unit: "kg" });
    writeBatch(db, b, null);
    expect(addManualWeight(db, { tMs: at("2026-03-02") + 10 * 60_000, offsetS: FB, kg: 80.05 })).toEqual({ ok: false, reason: "duplicate" });
    expect(addManualWeight(db, { tMs: at("2026-03-02") + 10 * 60_000, offsetS: FB, kg: 81.0 })).toEqual({ ok: true }); // different weight
    expect(addManualWeight(db, { tMs: at("2026-03-03"), offsetS: FB, kg: 79.6 })).toEqual({ ok: true });
    expect(addManualWeight(db, { tMs: at("2026-03-03") + 5 * 60_000, offsetS: FB, kg: 79.6 })).toEqual({ ok: false, reason: "duplicate" });
    expect(addManualWeight(db, { tMs: at("2026-03-04"), offsetS: FB, kg: 10 })).toEqual({ ok: false, reason: "range" });
    const all = listWeights(db, at("2026-03-01"), at("2026-03-05"));
    expect(all.map((w) => [w.kg, w.manual])).toEqual([[80, false], [81, true], [79.6, true]]);
    expect(deleteManualWeight(db, at("2026-03-02"))).toBe(false); // Google entry stays
    expect(deleteManualWeight(db, at("2026-03-03"))).toBe(true);
    expect(listWeights(db, at("2026-03-01"), at("2026-03-05"))).toHaveLength(2);
  });
  it("body view: trend from all sources, change only with enough entries, goal progress", () => {
    const today = new Date(Date.now() + FB * 1000).toISOString().slice(0, 10);
    const d = (o: number) => new Date(Date.parse(`${today}T00:00:00Z`) + o * DAY).toISOString().slice(0, 10);
    for (let o = -40; o <= -1; o += 2) addManualWeight(db, { tMs: at(d(o)), offsetS: FB, kg: 78 - (o + 40) * 0.05 }); // slowly decreasing
    setSetting(db, "goals", { ...EMPTY_GOALS, weightKg: 75 });
    const v = bodyView(db, today, FB, TZ);
    expect(v.trend.length).toBe(20);
    expect(v.week?.kg).toBeLessThan(0);
    expect(v.month?.kg).toBeLessThan(0);
    expect(v.goal).toMatchObject({ targetKg: 75 });
    expect(v.goal?.projectedWeeks).toBeGreaterThan(0);
    expect(v.energy.balance.status).toBe("insufficient");
  });
});

describe("reports (R2)", () => {
  it("uses complete days only, compares totals per day, reports baseline calibration and goal completion", () => {
    const today = "2026-03-05"; // Thursday → week 2 Mar – 8 Mar, 3 complete days
    for (const [d, n] of [["2026-03-02", 10_000], ["2026-03-03", 6000], ["2026-03-05", 500], ["2026-02-24", 8000]] as const) {
      const b = emptyBatch();
      b.obs.push({ source: fitbit, dataType: "steps", startMs: at(d, 9), endMs: at(d, 9) + 60_000, variant: "", utcOffsetS: FB, value: n, unit: "count" });
      writeBatch(db, b, null);
    }
    setSetting(db, "goals", { ...EMPTY_GOALS, stepsDaily: 8000 });
    const r = reportView(db, "week", today, today, FB, TZ);
    expect(r).toMatchObject({ completeDays: 3, partial: true });
    const steps = r.sections.find((s) => s.title === "Activity")!.rows.find((x) => x.def.id === "steps")!;
    expect(steps).toMatchObject({ current: 8000, total: 16_000, days: 2, previous: 8000, previousDays: 1, baseline: null });
    expect(r.goals.find((g) => g.def.id === "stepsDaily")).toMatchObject({ met: 1, missed: 1, periods: 3 }); // 4 Mar has no data
  });
});

describe("associations (R7 infrastructure)", () => {
  it("stays unavailable until 8 yes and 8 no days exist, then reports a difference with a CI", () => {
    const today = "2026-04-01";
    const habit = createHabit(db, { name: "Late meal", kind: "boolean" });
    const hrv = (d: string, v: number) => { const b = emptyBatch(); b.daily.push({ source: fitbit, metric: "hrv_rmssd_daily", date: d, value: v, unit: "ms" }); writeBatch(db, b, null); };
    const dd = (o: number) => new Date(Date.parse(`${today}T00:00:00Z`) - o * DAY).toISOString().slice(0, 10);
    for (let o = 2; o <= 11; o++) { setEntry(db, habit, dd(o), o % 2 === 0); hrv(dd(o - 1), o % 2 === 0 ? 40 + (o % 3) : 50 + (o % 3)); }
    let v = associationsView(db, today, FB);
    expect(v.comparisons).toBe(0); // 5 yes / 5 no
    for (let o = 12; o <= 21; o++) { setEntry(db, habit, dd(o), o % 2 === 0); hrv(dd(o - 1), o % 2 === 0 ? 40 + (o % 3) : 50 + (o % 3)); }
    v = associationsView(db, today, FB);
    const r = v.habits[0]!.results.find((x) => x.outcome.id === "hrv")!.assoc;
    expect(r).toMatchObject({ status: "ok", kind: "difference", n: { yes: 10, no: 10 }, notable: true });
  });
});
