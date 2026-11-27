import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DB } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { writeBatch } from "@/server/store";
import { emptyBatch, type SourceDescriptor } from "@/server/providers/google/normalize";
import { listWorkouts, setWorkoutLabel, workoutDetail, isSimilarWorkout } from "@/server/analytics/workouts";
import { cardioView } from "@/server/analytics/cardio";
import { sleepDetail } from "@/server/analytics/sleep-detail";
import { computeDerived } from "@/server/analytics/derive";
import { setSetting, EMPTY_GOALS } from "@/server/settings";

// FICTIONAL data only.
const TZ = "Europe/Brussels", FB = 3600, H = 3_600_000, M = 60_000;
const fitbit: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Fitbit Air" };
const hevy: SourceDescriptor = { provider: "google", platform: "HEALTH_KIT", appPackage: "com.hevyapp.hevy" };
let db: DB;
beforeEach(() => { db = openDatabase(":memory:"); setSetting(db, "profileAge", 30); });

function exercise(id: string, src: SourceDescriptor, startMs: number, min: number, type = "STRENGTH_TRAINING") {
  const b = emptyBatch();
  b.exercise.push({ source: src, id, startMs, endMs: startMs + min * M, startOffsetS: FB, exerciseType: type, displayName: type } as never);
  writeBatch(db, b, null);
}

describe("workout labels (R1)", () => {
  it("labels a grouped workout without touching provider rows, and survives regrouping", () => {
    const s = Date.UTC(2026, 2, 2, 17);
    exercise("hevy-1", hevy, s, 60); exercise("fit-1", fitbit, s + 5 * M, 50);
    const [w] = listWorkouts(db, s - H, s + 3 * H, TZ);
    expect(w!.sources).toHaveLength(2);
    setWorkoutLabel(db, w!.sources.map((x) => x.sessionId), { name: "Push day", category: "push", effort: 7 });
    const [l] = listWorkouts(db, s - H, s + 3 * H, TZ);
    expect(l).toMatchObject({ title: "Push day", typeTitle: "Strength training", label: { category: "push", effort: 7 }, cardio: false });
    expect(db.select().from(t.exerciseSessions).all().map((r) => r.displayName)).toEqual(["STRENGTH_TRAINING", "STRENGTH_TRAINING"]);
    // If only one session keeps a label row (e.g. a new duplicate arrives), the group still shows it.
    db.$client.prepare("delete from workout_annotations where session_id = ?").run("fit-1");
    exercise("hevy-dup", hevy, s + 2 * M, 55);
    expect(listWorkouts(db, s - H, s + 3 * H, TZ)[0]!.label?.category).toBe("push");
    setWorkoutLabel(db, ["hevy-1", "fit-1"], { name: null, category: null, effort: null });
    expect(listWorkouts(db, s - H, s + 3 * H, TZ)[0]!.label).toBeNull();
  });
  it("similar workouts: same category when labelled, else same type without another label", () => {
    const a = { type: "STRENGTH_TRAINING", label: { name: null, category: "push" as const, effort: null } };
    expect(isSimilarWorkout(a, { type: "WALKING", label: { name: null, category: "push", effort: null } })).toBe(true);
    expect(isSimilarWorkout(a, { type: "STRENGTH_TRAINING", label: null })).toBe(false);
    const b = { type: "STRENGTH_TRAINING", label: null };
    expect(isSimilarWorkout(b, { type: "STRENGTH_TRAINING", label: null })).toBe(true);
    expect(isSimilarWorkout(b, { type: "STRENGTH_TRAINING", label: { name: null, category: "legs", effort: null } })).toBe(false);
  });
  it("workout detail compares with similar labelled workouts", () => {
    for (let d = 0; d < 3; d++) {
      const s = Date.UTC(2026, 2, 2 + d * 2, 17);
      exercise(`w${d}`, fitbit, s, 45);
      setWorkoutLabel(db, [`w${d}`], { name: null, category: "legs", effort: 5 + d });
    }
    const d = workoutDetail(db, "w2", TZ)!;
    expect(d.similarBy).toBe("category");
    expect(d.history.map((h) => h.id)).toEqual(["w1", "w0"]);
    expect(d.similarAverage).toMatchObject({ n: 2, effort: 5.5 });
  });
});

describe("cardio weeks (R3)", () => {
  it("sums zone minutes per ISO week, marks the current week partial, and classifies cardio sessions", () => {
    // Two days of fictional heart rate at 125 bpm (65 % of HRmax 190 → Z2), 30 min each, in the week of 2026-03-02.
    for (const day of ["2026-03-03", "2026-03-04"]) {
      const b = emptyBatch();
      const start = Date.parse(`${day}T08:00:00Z`);
      for (let i = 0; i < 600; i++) b.hr.push({ source: fitbit, tMs: start + i * 3000, utcOffsetS: FB, bpm: 125, motion: null });
      writeBatch(db, b, null);
    }
    computeDerived(db, ["2026-03-03", "2026-03-04"], TZ);
    exercise("run", fitbit, Date.parse("2026-03-03T08:00:00Z"), 30, "RUNNING");
    exercise("lift", fitbit, Date.parse("2026-03-04T17:00:00Z"), 40);
    const v = cardioView(db, "2026-03-05", FB, TZ);
    expect(v.current).toMatchObject({ start: "2026-03-02", partial: true, sessions: 1, daysElapsed: 3 });
    expect(v.current.zone2Min).toBeCloseTo(60.9, 1); // 2 × (30 min + last sample up to the 30 s cap)
    expect(v.targets).toEqual({ azmWeekly: null, zone2WeeklyMin: null, cardioSessionsWeekly: null });
    expect(v.previous?.start).toBe("2026-02-23");
    expect(v.weeks).toHaveLength(12);
  });
});

describe("sleep detail (R4)", () => {
  function night(date: string, bedOffsetMin: number, awakeMin: number) {
    const wake = Date.parse(`${date}T06:00:00Z`), bed = wake - (8 * 60 + bedOffsetMin) * M;
    const b = emptyBatch();
    const stages = [
      { startMs: bed, endMs: bed + 10 * M, stage: "AWAKE", isShortAwakening: false },
      { startMs: bed + 10 * M, endMs: bed + 200 * M, stage: "LIGHT", isShortAwakening: false },
      { startMs: bed + 200 * M, endMs: bed + (200 + awakeMin) * M, stage: "AWAKE", isShortAwakening: false },
      { startMs: bed + (200 + awakeMin) * M, endMs: wake, stage: "DEEP", isShortAwakening: false },
    ];
    const asleep = (wake - bed) / M - 10 - awakeMin;
    b.sleep.push({ source: fitbit, id: `n-${date}`, startMs: bed, endMs: wake, startOffsetS: FB, endOffsetS: FB, sleepType: "STAGES", isMain: true, isNap: false, stagesStatus: "SUCCEEDED", updatedAt: wake, stages, summary: { minutesAsleep: String(asleep) } } as never);
    writeBatch(db, b, null);
  }
  it("computes wakings, compares nights and recommends a bedtime from the wake target", () => {
    for (let d = 1; d <= 6; d++) night(`2026-03-0${d}`, 0, 12);
    night("2026-03-07", 30, 20);
    setSetting(db, "goals", { ...EMPTY_GOALS, wakeMin: 7 * 60 });
    const x = sleepDetail(db, "2026-03-07", FB, 7 * 60);
    expect(x.interruptions).toMatchObject({ wasoMin: 20, interruptions: 1 });
    expect(x.previous?.wasoMin).toBe(12);
    expect(x.average.nights).toBe(7);
    expect(x.bedtime).toMatchObject({ wakeSource: "target", basis: "need-and-efficiency", wakeMin: 420 });
    expect(x.debtHistory.length).toBeGreaterThan(0);
  });
  it("without a wake target or 5 nights there is no recommendation (no guess)", () => {
    night("2026-03-07", 0, 5);
    const x = sleepDetail(db, "2026-03-07", FB, null);
    expect(x.bedtime).toBeNull();
    expect(x.usualWakeNightsNeeded).toBe(4);
  });
});
