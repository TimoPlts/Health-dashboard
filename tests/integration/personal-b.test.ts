import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type DB } from "@/server/db/client";
import { writeBatch } from "@/server/store";
import { emptyBatch, type SourceDescriptor } from "@/server/providers/google/normalize";
import { createHabit, deleteHabit, ensureDefaultHabits, entriesBetween, listHabits, setEntry, updateHabit } from "@/server/journal";
import { goalsView } from "@/server/analytics/goals";
import { EMPTY_GOALS, getSettings, setSetting } from "@/server/settings";

// FICTIONAL data only.
const TZ = "Europe/Brussels", FB = 3600;
const fitbit: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Fitbit Air" };
let db: DB;
beforeEach(() => { db = openDatabase(":memory:"); });

describe("habit journal (R6)", () => {
  it("creates the suggested habits once; removing them does not bring them back", () => {
    ensureDefaultHabits(db);
    const names = listHabits(db).map((h) => h.name);
    expect(names).toEqual(["Caffeine", "Supplements", "Creatine", "Stress", "Late meal", "Alcohol", "Stretching", "Fatigue"]);
    for (const h of listHabits(db)) deleteHabit(db, h.id);
    ensureDefaultHabits(db);
    expect(listHabits(db)).toHaveLength(0);
    expect(getSettings(db).habitsSeeded).toBe(true);
  });
  it("logs, validates, clears (not logged ≠ no), archives and deletes", () => {
    const yes = createHabit(db, { name: "Meditation", kind: "boolean" });
    const cups = createHabit(db, { name: "Tea", kind: "number", unit: "cups" });
    expect(setEntry(db, yes, "2026-03-02", true)).toBe(true);
    expect(setEntry(db, yes, "2026-03-03", false)).toBe(true);
    expect(setEntry(db, cups, "2026-03-02", 2)).toBe(true);
    expect(setEntry(db, cups, "2026-03-02", -1)).toBe(false);
    expect(setEntry(db, "missing", "2026-03-02", 1)).toBe(false);
    let e = entriesBetween(db, "2026-03-01", "2026-03-05");
    expect([...e.get(yes)!]).toEqual([["2026-03-02", 1], ["2026-03-03", 0]]);
    expect(e.get(yes)!.has("2026-03-04")).toBe(false); // not logged: no value at all
    setEntry(db, yes, "2026-03-03", null);
    e = entriesBetween(db, "2026-03-01", "2026-03-05");
    expect(e.get(yes)!.has("2026-03-03")).toBe(false);
    updateHabit(db, cups, { archived: true });
    expect(listHabits(db).map((h) => h.name)).toEqual(["Meditation"]);
    expect(entriesBetween(db, "2026-03-01", "2026-03-05").get(cups)?.get("2026-03-02")).toBe(2); // history kept
    deleteHabit(db, cups);
    expect(entriesBetween(db, "2026-03-01", "2026-03-05").has(cups)).toBe(false);
  });
});

describe("goals (R8)", () => {
  function steps(date: string, n: number) {
    const b = emptyBatch();
    const s = Date.parse(`${date}T09:00:00Z`);
    b.obs.push({ source: fitbit, dataType: "steps", startMs: s, endMs: s + 60_000, variant: "", utcOffsetS: FB, value: n, unit: "count" });
    writeBatch(db, b, null);
  }
  it("evaluates only goals that are set; days without data are not missed; today is in progress", () => {
    const today = new Date(Date.now() + FB * 1000).toISOString().slice(0, 10);
    const d = (o: number) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
    steps(d(-3), 10_000); steps(d(-2), 4000); steps(d(0), 2000); // d(-1): no data
    setSetting(db, "goals", { ...EMPTY_GOALS, stepsDaily: 8000 });
    const v = goalsView(db, today, FB, TZ);
    expect(v.set.map((g) => g.def.id)).toEqual(["stepsDaily"]);
    expect(v.unset).toHaveLength(7);
    const g = v.set[0]!;
    const by = Object.fromEntries(g.history.map((h) => [h.key, h.status]));
    expect([by[d(-3)], by[d(-2)], by[d(-1)], by[d(0)]]).toEqual(["met", "missed", "noData", "inProgress"]);
    expect(g.current).toMatchObject({ value: 2000, status: "inProgress" });
    expect(g.completion).toEqual({ met: 1, missed: 1, rate: 0.5 });
  });
});
