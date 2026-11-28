import { describe, expect, it } from "vitest";
import { weightTrend } from "@/lib/metrics/weight";
import {
  consistency, extremes, observedRate, phaseOn, phaseProblem, phaseProgress, rollingAverage, selectDailyWeights, weekOverWeek,
  type WeighIn, type WeightPhase,
} from "@/lib/metrics/weight-tracker";
import { zonedInstant } from "@/lib/time";

// FICTIONAL values only.
const day = (o: number) => new Date(Date.parse("2026-03-01T00:00:00Z") + o * 86_400_000).toISOString().slice(0, 10);
const w = (key: string, date: string, hh: number, kg: number, manual = true): WeighIn => ({ key, date, tMs: Date.parse(`${date}T00:00:00Z`) + hh * 3_600_000, localMin: hh * 60, kg, manual });
const series = (kgs: (number | null)[]) => kgs.flatMap((kg, i) => (kg === null ? [] : [{ date: day(i), weightKg: kg }]));

describe("one weigh-in per day (weight-trend@2)", () => {
  it("prefers the designated weigh-in, then the first morning one, then the first of the day", () => {
    const e = [w("a", day(0), 22, 81), w("b", day(0), 7, 80), w("c", day(0), 9, 80.4), w("d", day(1), 1, 79.9), w("e", day(1), 20, 80.8), w("f", day(2), 8, 80.1), w("g", day(2), 7, 79.8)];
    const d = selectDailyWeights(e, new Map([[day(2), "f"]]));
    expect(d.map((x) => [x.date, x.weightKg, x.basis, x.count])).toEqual([
      [day(0), 80, "morning", 3], [day(1), 79.9, "first", 2], [day(2), 80.1, "chosen", 2],
    ]);
  });
  it("a stale designation (deleted entry) falls back to the morning rule", () => {
    expect(selectDailyWeights([w("x", day(0), 7, 80)], new Map([[day(0), "gone"]]))[0]).toMatchObject({ weightKg: 80, basis: "morning" });
  });
  it("regression: with one weigh-in per day the trend is identical to weight-trend@1", () => {
    const one = [w("a", day(0), 7, 80), w("b", day(1), 7, 79.4), w("c", day(4), 7, 79.9), w("d", day(5), 7, 79.1)];
    const v2 = weightTrend(selectDailyWeights(one));
    const v1 = weightTrend(one.map((x) => ({ date: x.date, weightKg: x.kg }))); // @1: mean of a single entry = itself
    expect(v2.map((p) => p.trendKg)).toEqual(v1.map((p) => p.trendKg));
  });
  it("an evening weigh-in no longer pulls the day's weight up (the reason for @2)", () => {
    const d = selectDailyWeights([w("m", day(0), 7, 80), w("e", day(0), 21, 81.6)]);
    expect(d[0]!.weightKg).toBe(80); // @1 would have used the mean, 80.8
  });
});

describe("weight statistics (weight-stats@1)", () => {
  it("rolling average needs 3 weigh-ins and skips missing days (never zero)", () => {
    const s = series([80, null, null, null, 79, null, 78.5]);
    expect(rollingAverage(s, day(6))).toEqual({ kg: (80 + 79 + 78.5) / 3, n: 3, from: day(0), to: day(6) });
    expect(rollingAverage(series([80, null, null, null, null, null, 79]), day(6))).toBeNull();
  });
  it("week over week compares equal adjacent 7-day periods", () => {
    const s = series([81, 81, 81, null, null, null, null, 80, null, 80, null, 80, null, null]);
    const r = weekOverWeek(s, day(13));
    expect(r.change!.kg).toBeCloseTo(-1, 10);
    expect(r.change!.pct).toBeCloseTo((-1 / 81) * 100, 10);
    expect(weekOverWeek(series([81, 81, null, null, null, null, null, 80, 80, 80]), day(13)).change).toBeNull(); // previous week has 2
  });
  it("extremes and consistency", () => {
    const s = series([80, 79.2, null, 80.6]);
    expect(extremes(s, day(0), day(3))).toEqual({ min: { date: day(1), kg: 79.2 }, max: { date: day(3), kg: 80.6 }, n: 3 });
    expect(extremes(s, day(10), day(12))).toBeNull();
    const dates = new Set([day(10), day(11), day(12), day(8)]);
    expect(consistency(dates, day(13), 7)).toEqual({ logged: 4, days: 7, share: 4 / 7, streak: 3 }); // today not yet weighed
    expect(consistency(new Set([...dates, day(13)]), day(13), 7).streak).toBe(4);
  });
  it("observed rate is the least-squares slope and handles irregular spacing", () => {
    const pts = [0, 3, 4, 9, 14, 20].map((o) => ({ date: day(o), weightKg: 80 - 0.05 * o }));
    expect(observedRate(pts, day(0), day(20))!.kgPerWeek).toBeCloseTo(-0.35, 10);
    expect(observedRate(pts.slice(0, 4), day(0), day(20))).toBeNull(); // 4 weigh-ins
    expect(observedRate(pts, day(0), day(9))).toBeNull(); // 4 in range
    expect(observedRate([0, 1, 2, 3, 4].map((o) => ({ date: day(o), weightKg: 80 })), day(0), day(4))).toBeNull(); // span < 14 days
  });
});

describe("phases", () => {
  const cut: WeightPhase = { id: "p1", kind: "cut", name: "Cut", startDate: day(0), startKg: 82, endDate: null, goalKg: 78, targetRateKgWeek: -0.5 };
  it("finds the phase covering a date", () => {
    const old: WeightPhase = { ...cut, id: "p0", startDate: day(-30), endDate: day(-1) };
    expect(phaseOn([old, cut], day(5))!.id).toBe("p1");
    expect(phaseOn([old, cut], day(-3))!.id).toBe("p0");
    expect(phaseOn([old], day(5))).toBeNull();
  });
  it("progress uses the trend, the fitted rate, and projects only toward the goal", () => {
    const daily = Array.from({ length: 29 }, (_, i) => ({ date: day(i), weightKg: 82 - (i * 0.5) / 7 }));
    const trend = weightTrend(daily);
    const p = phaseProgress(cut, daily, trend, day(28));
    expect(p.days).toBe(28);
    expect(p.rate!.kgPerWeek).toBeCloseTo(-0.5, 6);
    expect(p.change!).toBeLessThan(0);
    expect(p.progress!).toBeGreaterThan(0);
    expect(p.progress!).toBeLessThan(1);
    expect(p.projectedWeeks!).toBeGreaterThan(0);
    const wrongWay = phaseProgress({ ...cut, goalKg: 90 }, daily, trend, day(28));
    expect(wrongWay.projectedWeeks).toBeNull();
    expect(phaseProgress({ ...cut, endDate: day(14) }, daily, trend, day(28)).end).toBe(day(14));
  });
  it("validates phases", () => {
    expect(phaseProblem(cut)).toBeNull();
    expect(phaseProblem({ ...cut, endDate: day(-1) })).toMatch(/before/);
    expect(phaseProblem({ ...cut, startKg: 10 })).toMatch(/Starting/);
    expect(phaseProblem({ ...cut, targetRateKgWeek: -3 })).toMatch(/rate/);
  });
});

describe("zonedInstant", () => {
  it("maps local wall-clock times to UTC across DST", () => {
    expect(zonedInstant("2026-01-15", 7, 0, "Europe/Brussels")).toEqual({ tMs: Date.parse("2026-01-15T06:00:00Z"), offsetS: 3600 });
    expect(zonedInstant("2026-07-15", 7, 0, "Europe/Brussels")).toEqual({ tMs: Date.parse("2026-07-15T05:00:00Z"), offsetS: 7200 });
  });
});
