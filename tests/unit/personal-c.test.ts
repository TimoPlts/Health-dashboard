import { describe, expect, it } from "vitest";
import { trendAt, weightChange, weightGoalProgress, weightTrend } from "@/lib/metrics/weight";
import { booleanAssociation, energyBalance, MIN_PAIRS, MIN_PER_GROUP, rankAssociation, t975 } from "@/lib/metrics/associations";

// FICTIONAL values only.
const day = (o: number) => new Date(Date.UTC(2026, 2, 1) + o * 86_400_000).toISOString().slice(0, 10);

describe("weight trend (weight-trend@1)", () => {
  it("starts at the first weight and moves 10 % per day toward each new weigh-in, time-aware", () => {
    const t = weightTrend([{ date: day(0), weightKg: 80 }, { date: day(1), weightKg: 90 }, { date: day(4), weightKg: 80 }]);
    expect(t[0]!.trendKg).toBe(80);
    expect(t[1]!.trendKg).toBeCloseTo(81, 6); // 80 + 0.1 × 10
    expect(t[2]!.trendKg).toBeCloseTo(81 + (1 - 0.9 ** 3) * (80 - 81), 6);
  });
  it("holds the trend between weigh-ins and is null before the first one", () => {
    const t = weightTrend([{ date: day(5), weightKg: 70 }]);
    expect(trendAt(t, day(4))).toBeNull();
    expect(trendAt(t, day(20))).toBe(70);
  });
  it("weekly / monthly change only with enough entries and history", () => {
    const sparse = weightTrend([{ date: day(0), weightKg: 80 }, { date: day(20), weightKg: 79 }]);
    expect(weightChange(sparse, day(20), 7)).toBeNull(); // only 1 entry in the last 14 days
    expect(weightChange(sparse, day(20), 30)).toBeNull(); // history < 30 days
    const two = weightTrend([{ date: day(0), weightKg: 80 }, { date: day(10), weightKg: 79 }]);
    expect(weightChange(two, day(10), 7)).not.toBeNull(); // 2 entries in 14 days and 10 days of history
    const t = weightTrend(Array.from({ length: 20 }, (_, i) => ({ date: day(i * 2), weightKg: 80 - i * 0.1 })));
    expect(weightChange(t, day(38), 7)!.kg).toBeLessThan(0);
    expect(weightChange(t, day(38), 30)!.kg).toBeLessThan(weightChange(t, day(38), 7)!.kg);
  });
  it("goal projection only when the trend moves toward the goal and 21+ days exist", () => {
    const down = weightTrend(Array.from({ length: 20 }, (_, i) => ({ date: day(i * 2), weightKg: 80 - i * 0.15 })));
    const g = weightGoalProgress(down, day(38), 75)!;
    expect(g.remainingKg).toBeLessThan(0);
    expect(g.projectedWeeks).toBeGreaterThan(0);
    expect(weightGoalProgress(down, day(38), 85)!.projectedWeeks).toBeNull(); // moving away from the goal
    expect(weightGoalProgress(weightTrend([{ date: day(0), weightKg: 80 }]), day(5), 75)!.projectedWeeks).toBeNull();
  });
});

describe("associations (assoc@1)", () => {
  it("t quantile matches tables", () => {
    expect(t975(10)).toBeCloseTo(2.228, 2);
    expect(t975(30)).toBeCloseTo(2.042, 2);
    expect(t975(1000)).toBeCloseTo(1.962, 2);
  });
  it("yes/no: refuses below 8 per group; detects a clear difference; includes 0 when none", () => {
    const mk = (yes: number[], no: number[]) => [...yes.map((y) => ({ x: 1, y })), ...no.map((y) => ({ x: 0, y }))];
    expect(booleanAssociation(mk([1, 2, 3], Array(20).fill(1)))).toMatchObject({ status: "insufficient", have: { yes: 3, no: 20 }, need: MIN_PER_GROUP });
    const clear = booleanAssociation(mk([40, 42, 41, 39, 43, 40, 41, 42, 40, 41], [50, 52, 51, 49, 53, 50, 51, 52, 50, 51]));
    expect(clear).toMatchObject({ status: "ok", kind: "difference", notable: true });
    if (clear.status === "ok" && clear.kind === "difference") expect(clear.diff).toBeCloseTo(-10, 6);
    const none = booleanAssociation(mk([50, 52, 48, 51, 49, 50, 52, 48], [51, 49, 50, 52, 48, 50, 49, 51]));
    expect(none).toMatchObject({ status: "ok", notable: false });
  });
  it("ranks: refuses below 20 days or without variation; handles ties", () => {
    const pairs = Array.from({ length: MIN_PAIRS }, (_, i) => ({ x: i % 5, y: (i % 5) * 2 + 1 }));
    const r = rankAssociation(pairs);
    expect(r).toMatchObject({ status: "ok", kind: "correlation" });
    if (r.status === "ok" && r.kind === "correlation") expect(r.rho).toBeCloseTo(1, 6);
    expect(rankAssociation(pairs.slice(0, 19)).status).toBe("insufficient");
    expect(rankAssociation(pairs.map((p) => ({ ...p, x: 1 }))).status).toBe("insufficient");
  });
  it("energy balance needs 7 days with both intake and expenditure", () => {
    const days = Array.from({ length: 10 }, (_, i) => day(i));
    const exp = new Map(days.map((d) => [d, 2500]));
    expect(energyBalance(new Map(), exp, days)).toEqual({ status: "insufficient", have: 0, need: 7 });
    expect(energyBalance(new Map(days.map((d) => [d, 2300])), exp, days)).toEqual({ status: "ok", meanKcal: -200, days: 10 });
  });
});
