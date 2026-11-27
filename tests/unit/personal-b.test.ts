import { describe, expect, it } from "vitest";
import { completion, evaluateAtLeast, evaluateBedtime, evaluateWake, progress } from "@/lib/metrics/goals";
import { DEFAULT_LAYOUT, MAX_FAVORITES, resolveLayout } from "@/lib/today-layout";
import { formatHabitValue, normaliseHabitValue } from "@/lib/metrics/journal";

describe("goal evaluation (goals@1)", () => {
  it("totals: met as soon as reached; missed only when complete; no data is never missed", () => {
    expect(evaluateAtLeast(9500, 9000, false)).toBe("met");
    expect(evaluateAtLeast(4000, 9000, false)).toBe("inProgress");
    expect(evaluateAtLeast(4000, 9000, true)).toBe("missed");
    expect(evaluateAtLeast(null, 9000, true)).toBe("noData");
    expect(evaluateAtLeast(null, 9000, false)).toBe("inProgress");
  });
  it("bedtime: in bed by target + 15 min, comparing across midnight", () => {
    const afterNoon = (hh: number, mm = 0) => ((hh * 60 + mm - 720) + 1440) % 1440;
    expect(evaluateBedtime(afterNoon(22, 50), 23 * 60)).toBe("met");
    expect(evaluateBedtime(afterNoon(23, 15), 23 * 60)).toBe("met");
    expect(evaluateBedtime(afterNoon(23, 16), 23 * 60)).toBe("missed");
    expect(evaluateBedtime(afterNoon(0, 30), 23 * 60 + 30)).toBe("missed");
    expect(evaluateBedtime(afterNoon(0, 10), 0)).toBe("met"); // target midnight
    expect(evaluateBedtime(null, 23 * 60)).toBe("noData");
  });
  it("wake-up: within 30 minutes either side", () => {
    expect(evaluateWake(7 * 60 + 25, 7 * 60)).toBe("met");
    expect(evaluateWake(6 * 60 + 29, 7 * 60)).toBe("missed");
    expect(evaluateWake(null, 7 * 60)).toBe("noData");
  });
  it("completion rate leaves out days without data and days in progress", () => {
    expect(completion(["met", "missed", "noData", "met", "inProgress"])).toEqual({ met: 2, missed: 1, rate: 2 / 3 });
    expect(completion(["noData"]).rate).toBeNull();
    expect(progress(null, 100)).toBeNull();
    expect(progress(150, 100)).toBe(1);
  });
});

describe("Today layout", () => {
  const known = new Set(["steps", "hrv", "resting_hr", "sleep_asleep", "spo2"]);
  it("defaults when nothing is saved", () => {
    expect(resolveLayout(null, known)).toEqual({ ...DEFAULT_LAYOUT, favorites: DEFAULT_LAYOUT.favorites.filter((f) => known.has(f)) });
  });
  it("keeps the saved order, drops unknown ids and appends cards added later", () => {
    const r = resolveLayout({ order: ["workouts", "hero", "bogus" as never, "hero"], hidden: ["vitals", "nope" as never], favorites: ["spo2", "unknown", "spo2"] }, known);
    expect(r.order.slice(0, 2)).toEqual(["workouts", "hero"]);
    expect(new Set(r.order).size).toBe(DEFAULT_LAYOUT.order.length);
    expect(r.hidden).toEqual(["vitals"]);
    expect(r.favorites).toEqual(["spo2"]);
  });
  it("limits favourites", () => {
    const many = Array.from({ length: 12 }, (_, i) => `m${i}`);
    expect(resolveLayout({ favorites: many }, new Set(many)).favorites).toHaveLength(MAX_FAVORITES);
  });
});

describe("journal values (journal@1)", () => {
  const bool = { kind: "boolean" as const, min: null, max: null, step: null };
  const scale = { kind: "scale" as const, min: 1, max: 5, step: 1 };
  const num = { kind: "number" as const, min: 0, max: 20, step: 1 };
  it("validates per habit type", () => {
    expect(normaliseHabitValue(bool, true)).toBe(1);
    expect(normaliseHabitValue(bool, 0)).toBe(0);
    expect(normaliseHabitValue(bool, 2)).toBeNull();
    expect(normaliseHabitValue(scale, 3)).toBe(3);
    expect(normaliseHabitValue(scale, 0)).toBeNull();
    expect(normaliseHabitValue(scale, 2.5)).toBeNull();
    expect(normaliseHabitValue(num, 2.345)).toBe(2.35);
    expect(normaliseHabitValue(num, -1)).toBeNull();
    expect(normaliseHabitValue(num, "3")).toBeNull();
  });
  it("formats values for display", () => {
    expect(formatHabitValue({ kind: "boolean", unit: null }, 0)).toBe("No");
    expect(formatHabitValue({ kind: "number", unit: "cups" }, 2)).toBe("2 cups");
    expect(formatHabitValue({ kind: "scale", unit: null }, 4)).toBe("4 · High");
  });
});
