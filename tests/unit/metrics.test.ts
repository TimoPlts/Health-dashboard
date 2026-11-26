import { describe, expect, it } from "vitest";
import { hrWindowStats, timeInZones, zoneBoundsBpm, estimateMaxHrTanaka, medianInterval } from "@/lib/metrics/heart-rate";
import { banisterTrimp, ewmaLoad } from "@/lib/metrics/training-load";
import { estimateOneRepMax, estimateOneRepMaxBrzycki, setsPerMuscle, volumeLoad } from "@/lib/metrics/strength";
import { rollingBaseline, sleepEfficiency, stageMinutes, zScore } from "@/lib/metrics/sleep-baseline";

const T0 = Date.UTC(2026, 2, 2, 17, 0, 0);
const s = (sec: number, bpm: number) => ({ tMs: T0 + sec * 1000, bpm });

describe("hrWindowStats", () => {
  it("time-weights samples and reports full coverage for regular 5 s data", () => {
    const samples = Array.from({ length: 12 }, (_, i) => s(i * 5, i < 6 ? 100 : 160)); // 60 s window
    const r = hrWindowStats(samples, T0, T0 + 60_000);
    expect(r.sampleCount).toBe(12);
    expect(r.coverage).toBeCloseTo(1, 5);
    expect(r.avgBpm).toBeCloseTo(130, 5);
    expect(r.minBpm).toBe(100);
    expect(r.maxBpm).toBe(160);
    expect(r.medianIntervalS).toBe(5);
  });

  it("does not interpolate across gaps longer than maxGapS", () => {
    const samples = [s(0, 100), s(5, 100), s(600, 150)]; // 10-minute hole
    const r = hrWindowStats(samples, T0, T0 + 605_000, 30);
    expect(r.coveredS).toBe(5 + 30 + 5);
    expect(r.coverage).toBeLessThan(0.1);
  });

  it("returns nulls (not zeros) when there is no data", () => {
    const r = hrWindowStats([], T0, T0 + 60_000);
    expect(r.avgBpm).toBeNull();
    expect(r.minBpm).toBeNull();
    expect(r.coverage).toBe(0);
  });

  it("ignores samples outside the window", () => {
    const r = hrWindowStats([s(-10, 200), s(0, 100), s(70, 200)], T0, T0 + 60_000);
    expect(r.sampleCount).toBe(1);
    expect(r.maxBpm).toBe(100);
  });

  it("medianInterval handles too-few samples", () => {
    expect(medianInterval([s(0, 60)])).toBeNull();
  });
});

describe("HRR zones (Karvonen)", () => {
  it("computes boundaries from resting and max HR", () => {
    const b = zoneBoundsBpm(50, 190);
    expect(b[0]).toEqual({ name: "Z1", lowerBpm: 120, upperBpm: 134 });
    expect(b[4]!.upperBpm).toBe(Infinity);
  });

  it("assigns time per zone, including below Z1", () => {
    const samples = [s(0, 90), s(10, 125), s(20, 180)];
    const r = timeInZones(samples, T0, T0 + 30_000, 50, 190);
    expect(r.seconds.below).toBe(10);
    expect(r.seconds.Z1).toBe(10);
    expect(r.seconds.Z5).toBe(10);
  });

  it("rejects invalid inputs", () => {
    expect(() => zoneBoundsBpm(60, 60)).toThrow();
  });

  it("Tanaka HRmax", () => {
    expect(estimateMaxHrTanaka(30)).toBeCloseTo(187, 5);
  });
});

describe("Banister TRIMP", () => {
  it("matches the closed form for constant HR", () => {
    // 30 min at HRr = 0.5, male: 30 · 0.5 · 0.64 · e^(0.96)
    const samples = Array.from({ length: 360 }, (_, i) => s(i * 5, 120)); // rest 50, max 190 → HRr 0.5
    const r = banisterTrimp(samples, T0, T0 + 1_800_000, 50, 190, "male");
    expect(r.trimp).toBeCloseTo(30 * 0.5 * 0.64 * Math.exp(1.92 * 0.5), 6);
    expect(r.coverage).toBeCloseTo(1, 5);
  });

  it("female coefficient yields lower TRIMP at equal HRr", () => {
    const samples = Array.from({ length: 60 }, (_, i) => s(i * 5, 120));
    const m = banisterTrimp(samples, T0, T0 + 300_000, 50, 190, "male").trimp;
    const f = banisterTrimp(samples, T0, T0 + 300_000, 50, 190, "female").trimp;
    expect(f).toBeLessThan(m);
  });

  it("clamps HR below rest to zero load", () => {
    expect(banisterTrimp([s(0, 40)], T0, T0 + 5000, 50, 190, "male").trimp).toBe(0);
  });
});

describe("EWMA load", () => {
  it("seeds with the first value and carries across unknown days", () => {
    const r = ewmaLoad([100, null, 0]);
    expect(r[0]!.acute).toBe(100);
    expect(r[1]!.gap).toBe(true);
    expect(r[1]!.acute).toBe(100);
    expect(r[2]!.acute).toBeCloseTo(75, 5); // λ = 0.25
  });
});

describe("strength", () => {
  it("Epley e1RM, excluding warm-ups and out-of-range reps", () => {
    expect(estimateOneRepMax({ setType: "normal", weightKg: 100, reps: 5 })).toBeCloseTo(116.6667, 3);
    expect(estimateOneRepMax({ setType: "normal", weightKg: 100, reps: 1 })).toBe(100);
    expect(estimateOneRepMax({ setType: "warmup", weightKg: 100, reps: 5 })).toBeNull();
    expect(estimateOneRepMax({ setType: "normal", weightKg: 100, reps: 15 })).toBeNull();
    expect(estimateOneRepMax({ setType: "normal", weightKg: null, reps: 5 })).toBeNull();
  });

  it("Brzycki e1RM", () => {
    expect(estimateOneRepMaxBrzycki({ setType: "normal", weightKg: 100, reps: 10 })).toBeCloseTo(133.33, 1);
  });

  it("volume load excludes warm-ups and handles bodyweight sets", () => {
    const v = volumeLoad([
      { setType: "warmup", weightKg: 40, reps: 10 },
      { setType: "normal", weightKg: 80, reps: 8 },
      { setType: "failure", weightKg: null, reps: 20 },
    ]);
    expect(v).toMatchObject({ volumeKg: 640, workingSets: 2, reps: 28 });
  });

  it("sets per muscle with fractional secondary credit", () => {
    expect(setsPerMuscle([{ primary: "chest", secondary: ["triceps"], workingSets: 4 }])).toEqual({ chest: 4, triceps: 2 });
  });
});

describe("sleep & baselines", () => {
  it("sleep efficiency", () => {
    expect(sleepEfficiency(420, 480)).toBeCloseTo(87.5, 5);
    expect(sleepEfficiency(null, 480)).toBeNull();
    expect(sleepEfficiency(400, 0)).toBeNull();
  });

  it("stage minutes skip short awakenings", () => {
    const m = stageMinutes([
      { startMs: 0, endMs: 600_000, stage: "LIGHT" },
      { startMs: 60_000, endMs: 120_000, stage: "AWAKE", isShortAwakening: true },
    ]);
    expect(m).toEqual({ LIGHT: 10 });
  });

  it("baseline requires a minimum number of days", () => {
    expect(rollingBaseline([50, 52, null], 28, 14)).toBeNull();
    const vals = Array.from({ length: 20 }, (_, i) => 50 + (i % 5));
    const b = rollingBaseline(vals, 28, 14)!;
    expect(b.n).toBe(20);
    expect(b.mean).toBeCloseTo(52, 5);
    expect(zScore(52, b)).toBeCloseTo(0, 5);
  });

  it("supports ln-transformed HRV baselines", () => {
    const b = rollingBaseline(Array(20).fill(60).map((v, i) => v + i), 28, 14, Math.log)!;
    expect(b.mean).toBeCloseTo(Math.log(60) + 0.14, 1);
  });
});
