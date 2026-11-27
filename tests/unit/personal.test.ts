import { describe, expect, it } from "vitest";
import { medianMinutes, recommendedBedtime, wakeAfterSleepOnset } from "@/lib/metrics/sleep-detail";
import { addDays, aggregateDays, completeDays, downsample, periodOf, previousPeriod, weekStart } from "@/lib/metrics/periods";
import { isCardio, validEffort } from "@/lib/metrics/workout-labels";

// FICTIONAL values only.
const M = 60_000, T0 = Date.UTC(2026, 2, 1, 22);
const seg = (stage: string, fromMin: number, toMin: number, short = false) => ({ stage, startMs: T0 + fromMin * M, endMs: T0 + toMin * M, isShortAwakening: short });

describe("wake after sleep onset (sleep-waso@1)", () => {
  it("counts awake time between first sleep and final wake only; short awakenings separately", () => {
    const r = wakeAfterSleepOnset([
      seg("AWAKE", 0, 15), seg("LIGHT", 15, 60), seg("AWAKE", 60, 66), seg("DEEP", 66, 120), seg("AWAKE", 120, 123), seg("REM", 123, 200), seg("AWAKE", 200, 215),
      seg("AWAKE", 90, 91, true),
    ])!;
    expect(r.wasoMin).toBeCloseTo(9, 5); // 6 + 3; first 15 min (falling asleep) and last 15 min (after final wake) excluded
    expect(r.interruptions).toBe(2);
    expect(r.longestMin).toBeCloseTo(6, 5);
    expect(r.shortAwakenings).toBe(1);
  });
  it("is null without sleep stages (never zero)", () => {
    expect(wakeAfterSleepOnset([])).toBeNull();
    expect(wakeAfterSleepOnset([seg("AWAKE", 0, 30)])).toBeNull();
  });
});

describe("recommended bedtime (bedtime@1)", () => {
  it("uses sleep need ÷ median efficiency once 5 nights exist", () => {
    const r = recommendedBedtime({ wakeMin: 7 * 60, needMin: 480, efficienciesPct: [90, 90, 88, 92, 90, null] });
    expect(r.basis).toBe("need-and-efficiency");
    expect(r.efficiencyPct).toBe(90);
    expect(r.timeInBedMin).toBeCloseTo(533.33, 1);
    expect(r.bedtimeMin).toBe(1440 + 420 - 533); // 22:07 the evening before
  });
  it("falls back to the bare need with fewer than 5 nights, labelled need-only", () => {
    const r = recommendedBedtime({ wakeMin: 7 * 60, needMin: 480, efficienciesPct: [90, 91] });
    expect(r).toMatchObject({ basis: "need-only", efficiencyPct: null, bedtimeMin: 23 * 60 });
  });
  it("median wake time needs 5 nights", () => {
    expect(medianMinutes([400, 410, 420])).toBeNull();
    expect(medianMinutes([400, 410, 420, 430, 440, null])).toBe(420);
  });
});

describe("periods", () => {
  it("ISO weeks start on Monday; months have the right length", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // Thursday → Monday
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday
    expect(periodOf("month", "2028-02-10").days).toHaveLength(29);
    expect(previousPeriod(periodOf("month", "2026-01-15")).from).toBe("2025-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("today is incomplete and missing days are skipped, not zero", () => {
    const p = periodOf("week", "2026-11-26");
    expect(completeDays(p, "2026-11-26")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    const s = new Map([["2026-11-23", 100], ["2026-11-25", 50]]);
    expect(aggregateDays(s, p.days)).toEqual({ sum: 150, mean: 75, daysWithData: 2, daysCounted: 7 });
    expect(aggregateDays(new Map(), p.days)).toMatchObject({ sum: null, mean: null, daysWithData: 0 });
  });
  it("downsampling averages per bucket and keeps gaps as gaps", () => {
    const t = Date.UTC(2026, 0, 1);
    const pts = [{ tMs: t, bpm: 50 }, { tMs: t + 30_000, bpm: 70 }, { tMs: t + 300_000, bpm: 80 }];
    expect(downsample(pts, 60_000)).toEqual([{ tMs: t + 30_000, bpm: 60 }, { tMs: t + 330_000, bpm: 80 }]);
  });
});

describe("workout labels", () => {
  it("a category label overrides the exercise type for cardio classification", () => {
    expect(isCardio("RUNNING", null)).toBe(true);
    expect(isCardio("STRENGTH_TRAINING", null)).toBe(false);
    expect(isCardio("STRENGTH_TRAINING", "cardio")).toBe(true);
    expect(isCardio("WALKING", "legs")).toBe(false);
  });
  it("effort is an integer 1–10", () => {
    expect([1, 10].every(validEffort)).toBe(true);
    expect([0, 11, 5.5, null, "7"].some(validEffort)).toBe(false);
  });
});
