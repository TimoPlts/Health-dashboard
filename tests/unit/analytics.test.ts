import { describe, expect, it } from "vitest";
import { acwr, chooseHrMax, LOAD_MIN_WORN_MIN, trackedLoad, zoneLoad } from "@/lib/metrics/load";
import { fatigueFlags, hrvBaseline, normCdf, recoveryIndex, rhrBaseline, trainingReadiness } from "@/lib/metrics/recovery";
import { groupSessions } from "@/server/analytics/workouts";
import { midpointVariability, sleepDebt, sleepRegularityIndex, sleepScore } from "@/lib/metrics/sleep";

// All values are FICTIONAL.
const T0 = Date.UTC(2026, 2, 2, 17);
const series = (bpm: number, minutes: number, stepS = 3, start = T0) =>
  Array.from({ length: (minutes * 60) / stepS }, (_, i) => ({ tMs: start + i * stepS * 1000, bpm }));

describe("Edwards TRIMP / %HRmax zones", () => {
  it("assigns minutes to zones and weights them 1..5", () => {
    // 10 min at 65 % (Z2) + 10 min at 85 % (Z4), HRmax 200
    const s = [...series(130, 10), ...series(170, 10, 3, T0 + 600_000)];
    const z = zoneLoad(s, T0, T0 + 1_200_000, 200);
    expect(z.zoneMinutes[1]).toBeCloseTo(10, 1);
    expect(z.zoneMinutes[3]).toBeCloseTo(10, 1);
    expect(z.trimp).toBeCloseTo(10 * 2 + 10 * 4, 0);
    expect(z.coverage).toBeCloseTo(1, 2);
  });
  it("treats gaps as missing, not as time in a zone", () => {
    const s = [{ tMs: T0, bpm: 150 }, { tMs: T0 + 3_600_000, bpm: 150 }];
    const z = zoneLoad(s, T0, T0 + 3_600_030, 200);
    expect(z.coveredMinutes).toBeCloseTo(0.5, 2); // first sample capped at 30 s; second clipped at window end
    expect(z.coverage).toBeLessThan(0.02);
  });
  it("chooses HRmax: override > Google's 220 − age", () => {
    expect(chooseHrMax({ override: 190, age: 30 })).toEqual({ hrMax: 190, source: "override" });
    expect(chooseHrMax({ age: 30 })).toEqual({ hrMax: 190, source: "google-220-age" });
    expect(chooseHrMax({})).toBeNull();
  });
});

describe("ACWR", () => {
  it("is not reported until 21 tracked days exist", () => {
    expect(acwr(Array(10).fill(50)).ratio).toBeNull();
    expect(acwr(Array(10).fill(50)).trackedDays).toBe(10);
  });
  it("steady load ≈ 1.0 (optimal); a spike → high", () => {
    expect(acwr(Array(40).fill(50)).ratio).toBeCloseTo(1, 5);
    expect(acwr(Array(40).fill(50)).band).toBe("optimal");
    const spike = [...Array(35).fill(30), ...Array(7).fill(150)];
    expect(acwr(spike).band).toBe("high");
  });
  it("untracked days (null) are gaps, not zero load", () => {
    const withGaps = [...Array(30).fill(50), null, null, 50];
    expect(acwr(withGaps).ratio).toBeCloseTo(1, 5);
  });
});

describe("baselines, recovery and readiness", () => {
  const hrv = Array.from({ length: 28 }, (_, i) => 50 + (i % 5) - 2); // 48..52
  const rhr = Array.from({ length: 28 }, (_, i) => 55 + (i % 3) - 1); // 54..56
  it("baselines need 14 days and report calibration progress", () => {
    expect(hrvBaseline(hrv.slice(0, 5))).toEqual({ status: "calibrating", have: 5, need: 14 });
    expect(hrvBaseline([...Array(10).fill(null), ...hrv.slice(0, 5)])).toMatchObject({ status: "calibrating", have: 5 });
    expect(hrvBaseline(hrv)).toMatchObject({ status: "ok", n: 28 });
  });
  it("normCdf matches known values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });
  it("a typical day scores ~50 on HRV/RHR; better HRV and lower RHR score higher", () => {
    const base = { hrvBaseline: hrvBaseline(hrv), rhrBaseline: rhrBaseline(rhr), minutesAsleep: 480, sleepNeedMin: 480 };
    const typical = recoveryIndex({ ...base, hrvToday: Math.exp((hrvBaseline(hrv) as { mean: number }).mean), rhrToday: 55 });
    const good = recoveryIndex({ ...base, hrvToday: 60, rhrToday: 52 });
    expect(typical.status).toBe("ok");
    if (typical.status !== "ok" || good.status !== "ok") throw new Error();
    expect(typical.components.hrv).toBeCloseTo(50, 0);
    expect(good.score).toBeGreaterThan(typical.score);
    expect(Object.values(good.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it("sleep alone never produces a recovery score; calibration is reported instead", () => {
    const r = recoveryIndex({ hrvToday: 50, hrvBaseline: hrvBaseline([50, 51]), rhrToday: 55, rhrBaseline: rhrBaseline([55]), minutesAsleep: 480, sleepNeedMin: 480 });
    expect(r.status).toBe("calibrating");
  });
  it("readiness: suppressed HRV + elevated RHR → recover; normal → ready", () => {
    const hb = hrvBaseline(hrv), rb = rhrBaseline(rhr);
    expect(trainingReadiness({ hrvLast7: Array(7).fill(50), hrvBaseline: hb, rhrToday: 55, rhrBaseline: rb, acwr: 1 })).toMatchObject({ status: "ok", level: "ready" });
    expect(trainingReadiness({ hrvLast7: Array(7).fill(35), hrvBaseline: hb, rhrToday: 62, rhrBaseline: rb, acwr: 1 })).toMatchObject({ level: "recover", hrvState: "below", rhrHigh: true });
    expect(trainingReadiness({ hrvLast7: [50, null, null, null, null, null, null], hrvBaseline: hb, rhrToday: 55, rhrBaseline: rb, acwr: null }).status).toBe("missing");
  });
  it("fatigue flags are independent and explainable", () => {
    const f = fatigueFlags({ hrvState: "below", rhrToday: 62, rhrBaseline: rhrBaseline(rhr), acwr: 1.6, sleepDebtMin: 400, skinTempDeviation: 1.2, respToday: null, respBaseline: rhrBaseline([]) });
    expect(f.map((x) => x.id)).toEqual(["hrv", "rhr", "load", "sleep", "temp"]);
  });
});

describe("sleep analytics", () => {
  it("debt skips untracked nights and does not bank surplus", () => {
    expect(sleepDebt([420, null, 540, 480], 480)).toMatchObject({ debtMin: 60, tracked: 3 });
    expect(sleepDebt([null, null], 480)).toBeNull();
  });
  it("score: 8 h, 92 % efficiency, normal stages → 100; short night scores lower", () => {
    expect(sleepScore({ minutesAsleep: 480, efficiencyPct: 92, deepMin: 90, remMin: 110, needMin: 480 })!.score).toBeCloseTo(100, 5);
    const short = sleepScore({ minutesAsleep: 300, efficiencyPct: 80, deepMin: 40, remMin: 50, needMin: 480 })!;
    expect(short.score).toBeLessThan(80);
    expect(sleepScore({ minutesAsleep: 420, efficiencyPct: null, needMin: 480 })!.components.efficiency).toBeNull();
    expect(sleepScore({ minutesAsleep: null, efficiencyPct: 90, needMin: 480 })).toBeNull();
  });
  it("SRI = 100 for identical nights and lower for shifted ones", () => {
    const D = 86_400_000, d0 = Date.UTC(2026, 2, 1);
    const days = Array.from({ length: 7 }, (_, i) => d0 + i * D);
    const regular = [...days, d0 + 7 * D].map((d) => ({ startMs: d - 2 * 3_600_000, endMs: d + 6 * 3_600_000 }));
    expect(sleepRegularityIndex(regular, days)!.sri).toBeCloseTo(100, 5);
    const shifted = days.map((d, i) => ({ startMs: d - 2 * 3_600_000 + (i % 2) * 3 * 3_600_000, endMs: d + 6 * 3_600_000 + (i % 2) * 3 * 3_600_000 }));
    expect(sleepRegularityIndex(shifted, days)!.sri).toBeLessThan(60);
    expect(sleepRegularityIndex(regular, days.slice(0, 4))).toBeNull();
  });
  it("midpoint variability handles the midnight wrap", () => {
    const D = 86_400_000, d0 = Date.UTC(2026, 2, 1);
    const mids = [-10, 10, -5, 5, 0].map((m, i) => d0 + i * D + m * 60_000); // around 00:00 UTC
    const v = midpointVariability(mids, mids.map(() => 0))!;
    expect(v.sdMin).toBeLessThan(10);
  });
});

describe("workout grouping (Google sessions)", () => {
  const s = (id: string, startMin: number, endMin: number, type = "STRENGTH_TRAINING") => ({ id, startMs: startMin * 60_000, endMs: endMin * 60_000, exerciseType: type });
  it("merges same-type sessions overlapping ≥ 50 % of the shorter one (Fitbit + Hevy duplicates)", () => {
    const g = groupSessions([s("hevy", 0, 84), s("fitbit", 15, 58), s("hevy-dup", 10, 72)]);
    expect(g).toHaveLength(1);
    expect(g[0]!.map((x) => x.id).sort()).toEqual(["fitbit", "hevy", "hevy-dup"]);
  });
  it("keeps different types and small overlaps separate", () => {
    expect(groupSessions([s("walk", 0, 32, "TREADMILL_WALK"), s("lift", 4, 64)])).toHaveLength(2);
    expect(groupSessions([s("a", 0, 60), s("b", 55, 120)])).toHaveLength(2);
  });
});

describe("calculation audit 2026-11 regressions", () => {
  const hrv = Array.from({ length: 28 }, (_, i) => 50 + (i % 5) - 2);
  const rhr = Array.from({ length: 28 }, (_, i) => 55 + (i % 3) - 1);
  it("ACWR input: the incomplete current day and days with < 10 h wear are gaps, not low load", () => {
    expect(trackedLoad(80, 1200, true)).toBe(80);
    expect(trackedLoad(5, 1200, false)).toBeNull(); // today, partial
    expect(trackedLoad(20, LOAD_MIN_WORN_MIN - 1, true)).toBeNull(); // short wear
    expect(trackedLoad(0, 1400, true)).toBe(0); // a real rest day stays 0
    // A partial "today" passed as a gap leaves yesterday's ratio unchanged.
    const steady = Array(30).fill(50);
    expect(acwr([...steady, null]).ratio).toBeCloseTo(acwr(steady).ratio!, 10);
    expect(acwr([...steady, 5]).ratio!).toBeLessThan(0.9); // what the old behaviour did each morning
  });
  it("recovery@2 requires HRV: RHR + sleep alone are not called recovery", () => {
    const base = { hrvBaseline: hrvBaseline(hrv), rhrBaseline: rhrBaseline(rhr), minutesAsleep: 480, sleepNeedMin: 480 };
    expect(recoveryIndex({ ...base, hrvToday: null, rhrToday: 55 })).toMatchObject({ status: "missing" });
    expect(recoveryIndex({ ...base, hrvBaseline: hrvBaseline(hrv.slice(0, 6)), hrvToday: 50, rhrToday: 55 })).toMatchObject({ status: "calibrating", hrv: { have: 6 } });
    const noRhr = recoveryIndex({ ...base, hrvToday: 50, rhrToday: null });
    expect(noRhr.status).toBe("ok");
    if (noRhr.status === "ok") expect(Object.keys(noRhr.weights).sort()).toEqual(["hrv", "sleep"]);
  });
  it("readiness: one flag → caution; HRV above the band is reported but not flagged", () => {
    const hb = hrvBaseline(hrv), rb = rhrBaseline(rhr);
    expect(trainingReadiness({ hrvLast7: Array(7).fill(50), hrvBaseline: hb, rhrToday: 62, rhrBaseline: rb, acwr: 1 })).toMatchObject({ level: "caution", rhrHigh: true });
    expect(trainingReadiness({ hrvLast7: Array(7).fill(70), hrvBaseline: hb, rhrToday: 55, rhrBaseline: rb, acwr: 1 })).toMatchObject({ level: "ready", hrvState: "above" });
  });
  it("SRI with noon-to-noon windows is not lowered by an unrecorded following night", () => {
    const D = 86_400_000, H = 3_600_000, d0 = Date.UTC(2026, 2, 1);
    const nights = Array.from({ length: 6 }, (_, i) => d0 + i * D); // wake dates
    const sleep = nights.map((d) => ({ startMs: d - 1 * H, endMs: d + 7 * H }));
    // Noon windows (sleep-sri@2): every pair compares two recorded nights → perfectly regular.
    expect(sleepRegularityIndex(sleep, nights.map((d) => d - 12 * H))!.sri).toBeCloseTo(100, 5);
    // Midnight windows (sleep-sri@1): the last pair's evening reaches into an unrecorded night → lower.
    expect(sleepRegularityIndex(sleep, nights)!.sri).toBeLessThan(100);
  });
});
