import { describe, expect, it } from "vitest";
import { completeness, deviation, personalRange } from "@/lib/metrics/personal-range";
import { allocateIntervals, bucketSamples, hourTicks, hrZone, lineRuns, summariseInterval } from "@/lib/metrics/timeline";
import { adherence, consistentWeeks, dayStatus, emptyPlan, normalisePlan, plannedFor, weeklyAdherence, type TrainingPlan } from "@/lib/metrics/training-plan";
import { heat, isMonth, monthGrid, shiftMonth } from "@/lib/metrics/calendar";
import { civilDayBounds, offsetMs } from "@/lib/time";
import { rollingBaseline } from "@/lib/metrics/sleep-baseline";

describe("personal range (personal-range@1)", () => {
  const vals = Array.from({ length: 28 }, (_, i) => 50 + (i % 5) - 2); // 48..52

  it("is calibrating below 14 values and ignores nulls", () => {
    const r = personalRange([...Array(20).fill(null), 50, 51, 52]);
    expect(r).toMatchObject({ status: "calibrating", have: 3, need: 14 });
  });

  it("matches the existing rolling baseline on the linear scale", () => {
    const r = personalRange(vals);
    const b = rollingBaseline(vals)!;
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.typical).toBeCloseTo(b.mean, 10);
    expect(r.high - r.typical).toBeCloseTo(b.sd, 10);
    expect(r.typical - r.low).toBeCloseTo(b.sd, 10);
  });

  it("uses only the last 28 values", () => {
    const r = personalRange([...Array(30).fill(1000), ...vals]);
    expect(r.status === "ok" && r.typical).toBeCloseTo(50, 0);
  });

  it("log scale is the geometric mean with an asymmetric range", () => {
    const hrv = Array.from({ length: 20 }, (_, i) => (i % 2 ? 40 : 60));
    const r = personalRange(hrv, "log");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.typical).toBeCloseTo(Math.sqrt(40 * 60), 6);
    expect(r.high - r.typical).toBeGreaterThan(r.typical - r.low);
  });

  it("classifies deviation by z-score without judging it", () => {
    const r = personalRange(vals);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(deviation(r.typical, r).position).toBe("within");
    expect(deviation(r.typical + 1.5 * r.sigma, r).position).toBe("above");
    expect(deviation(r.typical - 3 * r.sigma, r).position).toBe("wellBelow");
    expect(deviation(53, r).diff).toBeCloseTo(53 - r.typical, 10);
  });

  it("no spread → no z and no position", () => {
    const r = personalRange(Array(14).fill(50));
    if (r.status !== "ok") throw new Error("expected ok");
    expect(deviation(51, r)).toEqual({ z: null, diff: 1, position: null });
  });

  it("completeness counts days with data, never fills gaps", () => {
    expect(completeness([1, null, 3, null], 4)).toEqual({ have: 2, of: 4, share: 0.5 });
    expect(completeness([0, 0], 2).have).toBe(2); // a real zero is data
  });
});

describe("timeline (timeline@1)", () => {
  const H = 3_600_000;

  it("buckets keep empty buckets as null", () => {
    const b = bucketSamples([{ tMs: 10, bpm: 60 }, { tMs: 20, bpm: 70 }, { tMs: 2500, bpm: 90 }], 0, 3000, 1000);
    expect(b.map((x) => x.mean)).toEqual([65, null, 90]);
    expect(b[0]).toMatchObject({ min: 60, max: 70, n: 2 });
  });

  it("does not join a line across a long gap", () => {
    const b = bucketSamples([{ tMs: 0, bpm: 60 }, { tMs: 60_000, bpm: 61 }, { tMs: 30 * 60_000, bpm: 62 }], 0, 31 * 60_000, 60_000);
    expect(lineRuns(b, 5 * 60_000).map((r) => r.length)).toEqual([2, 1]);
  });

  it("allocates intervals proportionally and preserves totals", () => {
    const out = allocateIntervals([{ startMs: 500, endMs: 1500, value: 100 }, { startMs: 2500, endMs: 2500, value: 3 }], 0, 4000, 1000);
    expect(out).toEqual([50, 50, 3, null]);
    expect(allocateIntervals([{ startMs: 0, endMs: 4000, value: 8 }], 0, 4000, 1000)).toEqual([2, 2, 2, 2]);
  });

  it("zones use the Edwards %HRmax bounds", () => {
    expect([90, 100, 120, 140, 160, 180].map((b) => hrZone(b, 200))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("hour ticks handle 23 h and 25 h days", () => {
    const tz = "Europe/Brussels";
    const off = (t: number) => offsetMs(t, tz);
    const [a, b] = civilDayBounds("2026-03-29", tz);
    expect((b - a) / H).toBe(23);
    const spring = hourTicks(a, b, off);
    expect(spring).toHaveLength(23);
    expect(spring.map((x) => x.hour)).not.toContain(2);
    const [c, d] = civilDayBounds("2026-10-25", tz);
    expect((d - c) / H).toBe(25);
    const autumn = hourTicks(c, d, off);
    expect(autumn).toHaveLength(25);
    expect(autumn.filter((x) => x.hour === 2)).toHaveLength(2);
    expect(autumn[0]!.hour).toBe(0);
  });

  it("hour ticks handle half-hour offsets", () => {
    const tz = "Asia/Kolkata";
    const [a, b] = civilDayBounds("2026-06-01", tz);
    const t = hourTicks(a, b, (x) => offsetMs(x, tz));
    expect(t).toHaveLength(24);
    expect(t[0]).toEqual({ tMs: a, hour: 0 });
  });

  it("summarises an interval from raw samples, gap-aware", () => {
    const s = [{ tMs: 0, bpm: 100 }, { tMs: 10_000, bpm: 150 }, { tMs: 20_000, bpm: 190 }, { tMs: 600_000, bpm: 60 }];
    const r = summariseInterval(s, 0, 600_000, 200);
    expect(r).toMatchObject({ n: 3, min: 100, max: 190 });
    expect(r.coveredMin).toBeCloseTo(50 / 60, 6); // 10 s + 10 s + 30 s cap
    expect(r.zoneMin![5]).toBeCloseTo(0.5, 6);
    expect(summariseInterval([], 0, 1000, 200).avg).toBeNull();
  });
});

describe("training plan (training-plan@1)", () => {
  // 2026-11-02 is a Monday.
  const plan: TrainingPlan = {
    ...emptyPlan("2026-11-02"),
    split: [
      { kind: "train", name: "Push", category: "push" }, { kind: "rest", name: null, category: null },
      { kind: "train", name: "Pull", category: "pull" }, { kind: "free", name: null, category: null },
      { kind: "train", name: null, category: null }, { kind: "rest", name: null, category: null }, { kind: "free", name: null, category: null },
    ],
  };
  const today = "2026-11-12"; // Thursday of week 2

  it("resolves the weekly split and overrides", () => {
    expect(plannedFor(plan, "2026-11-09").name).toBe("Push");
    const p2 = { ...plan, overrides: { "2026-11-09": { kind: "rest" as const, name: "Travel", category: null } } };
    expect(plannedFor(p2, "2026-11-09")).toEqual({ kind: "rest", name: "Travel", category: null });
    expect(plannedFor(null, "2026-11-09").kind).toBe("free");
  });

  it("classifies days", () => {
    const w = [
      { id: "a", date: "2026-11-02", category: "push" as const },
      { id: "b", date: "2026-11-03", category: null },
      { id: "c", date: "2026-11-04", category: "legs" as const },
      { id: "d", date: "2026-11-05", category: null },
      { id: "e", date: "2026-11-11", category: null },
    ];
    expect(dayStatus(plan, "2026-11-01", today, w)).toBe("before");
    expect(dayStatus(plan, "2026-11-02", today, w)).toBe("done");
    expect(dayStatus(plan, "2026-11-03", today, w)).toBe("restTrained");
    expect(dayStatus(plan, "2026-11-04", today, w)).toBe("different");
    expect(dayStatus(plan, "2026-11-05", today, w)).toBe("extra");
    expect(dayStatus(plan, "2026-11-06", today, w)).toBe("missed");
    expect(dayStatus(plan, "2026-11-07", today, w)).toBe("rest");
    expect(dayStatus(plan, "2026-11-11", today, w)).toBe("done"); // unlabelled workout counts
    expect(dayStatus(plan, today, today, w)).toBe("upcoming"); // today is not yet missed
  });

  it("adherence counts planned training only and never today as missed", () => {
    const weeks = weeklyAdherence(plan, today, [{ id: "a", date: "2026-11-02", category: "push" }, { id: "b", date: "2026-11-04", category: "pull" }, { id: "c", date: "2026-11-06", category: null }, { id: "d", date: "2026-11-09", category: "push" }], 3);
    expect(weeks.map((w) => w.planned)).toEqual([0, 3, 2]); // before plan; full week; Mon + Wed so far (Wed missed)
    expect(weeks[1]!.rate).toBe(1);
    expect(weeks[2]).toMatchObject({ done: 1, missed: 1, partial: true });
    expect(consistentWeeks(weeks)).toBe(1);
    expect(adherence(["missed", "rest", "upcoming"]).rate).toBe(0);
    expect(adherence(["rest", "free"]).rate).toBeNull();
  });

  it("normalises untrusted plan JSON", () => {
    expect(normalisePlan(null)).toBeNull();
    expect(normalisePlan({ since: "x", split: [] })).toBeNull();
    const p = normalisePlan({ since: "2026-01-05", split: [{ kind: "train", name: "  A  ", category: "bogus" }, { kind: "rest", category: "push" }, { kind: "zzz", name: "n" }], overrides: { bad: {}, "2026-01-06": { kind: "train" } } })!;
    expect(p.split).toHaveLength(7);
    expect(p.split[0]).toEqual({ kind: "train", name: "A", category: null });
    expect(p.split[1]).toEqual({ kind: "rest", name: null, category: null });
    expect(p.split[2]).toEqual({ kind: "free", name: null, category: null });
    expect(Object.keys(p.overrides)).toEqual(["2026-01-06"]);
  });
});

describe("calendar (calendar@1)", () => {
  it("builds Monday-first month grids", () => {
    const g = monthGrid("2026-02"); // 1 Feb 2026 is a Sunday
    expect(g[0]).toEqual([null, null, null, null, null, null, "2026-02-01"]);
    expect(g.flat().filter(Boolean)).toHaveLength(28);
    expect(g.every((r) => r.length === 7)).toBe(true);
  });
  it("shifts months across years and validates", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-11")).toBe(true);
  });
  it("heat keeps missing distinct from zero", () => {
    expect(heat(null, 0, 10)).toBeNull();
    expect(heat(0, 0, 10)).toBe(0);
    expect(heat(20, 0, 10)).toBe(1);
  });
});

describe("bucketZones", () => {
  it("splits sample time across buckets, caps gaps and sums to the covered time", async () => {
    const { bucketZones } = await import("@/lib/metrics/timeline");
    const s = [{ tMs: 50_000, bpm: 185 }, { tMs: 70_000, bpm: 120 }, { tMs: 200_000, bpm: 120 }];
    const r = bucketZones(s, 0, 240_000, 60_000, 200);
    // 50–70 s at 185 bpm (split 10 + 10), 70–100 s at 120 (30 s cap), nothing, 200–230 s (cap).
    expect(r.covered).toEqual([10, 40, 0, 30]);
    expect(r.zones![0]![5]).toBe(10);
    expect(r.zones![1]).toEqual([0, 0, 0, 0, 0, 10].map((v, i) => (i === 2 ? 30 : v)));
  });
});

describe("changing the weekly split keeps history", () => {
  it("archives the old split for past days only, once per day", async () => {
    const { withSplit, emptyPlan, plannedFor } = await import("@/lib/metrics/training-plan");
    const train = { kind: "train" as const, name: "A", category: null };
    const rest = { kind: "rest" as const, name: null, category: null };
    let p = withSplit(null, Array(7).fill(train), "2026-11-02");
    expect(p.since).toBe("2026-11-02");
    p = withSplit(p, Array(7).fill(rest), "2026-11-02"); // same day: nothing applied yet in the past
    expect(p.previous).toEqual([]);
    p = withSplit(p, Array(7).fill(train), "2026-11-10");
    p = withSplit(p, Array(7).fill({ kind: "free", name: null, category: null }), "2026-11-10"); // second change same day
    expect(p.previous).toHaveLength(1);
    expect(plannedFor(p, "2026-11-05").kind).toBe("rest");
    expect(plannedFor(p, "2026-11-10").kind).toBe("free");
    expect(emptyPlan("2026-01-01").previous).toEqual([]);
  });
});

describe("plan matching", () => {
  it("unlabelled workouts match by kind, labelled ones by category", async () => {
    const { matchesPlan } = await import("@/lib/metrics/training-plan");
    const w = (category: null | "push" | "cardio", cardio = false) => ({ id: "x", date: "2026-11-02", category, cardio });
    expect(matchesPlan(null, w(null, true))).toBe(true);
    expect(matchesPlan("push", w(null, true))).toBe(false); // a walk is not a push session
    expect(matchesPlan("push", w(null, false))).toBe(true); // unlabelled strength session
    expect(matchesPlan("cardio", w(null, true))).toBe(true);
    expect(matchesPlan("push", w("cardio"))).toBe(false);
    expect(matchesPlan("push", w("push"))).toBe(true);
  });
});
