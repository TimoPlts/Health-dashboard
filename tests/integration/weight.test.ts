import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, type DB } from "@/server/db/client";
import { writeBatch } from "@/server/store";
import { emptyBatch, type SourceDescriptor } from "@/server/providers/google/normalize";
import {
  addManualWeight, createPhase, deleteManualWeight, deletePhase, designateMorning, listPhases, listWeights, logMorningWeight, updateManualWeight, updatePhase, weightData,
} from "@/server/weight";
import { weightHistory, weightView } from "@/server/analytics/weight";
import { calendarView } from "@/server/analytics/calendar";
import { metricSeries } from "@/server/analytics/values";
import { METRIC_BY_ID } from "@/server/analytics/registry";
import { createBackup, verifyBackup } from "@/server/data/backup";
import { exportAll } from "@/server/data/export";
import { deleteAllData } from "@/server/data/delete";
import { zonedInstant } from "@/lib/time";

// FICTIONAL data only. Home zone Europe/Brussels (UTC+1 in March).
const TZ = "Europe/Brussels", FB = 3600, TODAY = "2026-03-20";
const NOW = zonedInstant(TODAY, 7, 15, TZ).tMs;
const scale: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Smart scale" };
let db: DB, home: string;
beforeEach(() => { db = openDatabase(":memory:"); home = mkdtempSync(path.join(os.tmpdir(), "baseline-weight-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));
const google = (date: string, hh: number, mm: number, kg: number) => {
  const b = emptyBatch();
  const t = zonedInstant(date, hh, mm, TZ);
  b.obs.push({ source: scale, dataType: "weight", startMs: t.tMs, endMs: t.tMs, variant: "", utcOffsetS: t.offsetS, value: kg, unit: "kg" });
  writeBatch(db, b, null);
  return t.tMs;
};
const log = (date: string, kg: number, note?: string) => logMorningWeight(db, { date, kg, note, today: TODAY, nowMs: NOW, tz: TZ, fbOffsetS: FB });
const day = (o: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);

describe("quick morning log", () => {
  it("creates, then corrects in place (one designated weigh-in per day, no duplicates)", () => {
    expect(log(TODAY, 80.2, "after travel")).toEqual({ ok: true, action: "created" });
    expect(log(TODAY, 80.0)).toEqual({ ok: true, action: "updated" });
    const all = weightData(db, FB);
    expect(all.entries).toHaveLength(1);
    expect(all.entries[0]).toMatchObject({ kg: 80, manual: true, note: null, date: TODAY });
    expect(all.daily[0]).toMatchObject({ weightKg: 80, basis: "chosen" });
  });
  it("links to a scale reading already synced from Google instead of adding a duplicate", () => {
    google(TODAY, 7, 5, 80.3);
    expect(log(TODAY, 80.3)).toEqual({ ok: true, action: "linked" });
    expect(listWeights(db, 0, Number.MAX_SAFE_INTEGER)).toHaveLength(1);
    expect(weightData(db, FB).daily[0]).toMatchObject({ weightKg: 80.3, basis: "chosen" });
  });
  it("logs earlier days at 07:00 local, refuses the future and out-of-range values", () => {
    expect(log(day(-3), 81).ok).toBe(true);
    const e = weightData(db, FB).entries[0]!;
    expect(e).toMatchObject({ date: day(-3), localMin: 7 * 60 });
    expect(log(day(1), 80)).toEqual({ ok: false, reason: "future" });
    expect(log(TODAY, 12)).toEqual({ ok: false, reason: "range" });
  });
  it("keeps Google's weigh-ins; a manual morning weigh-in becomes the day's value", () => {
    const g = google(TODAY, 18, 0, 81.4);
    log(TODAY, 80.1);
    const d = weightData(db, FB);
    expect(d.entries).toHaveLength(2);
    expect(d.daily[0]!.weightKg).toBe(80.1);
    // Switch the day's weight to the Google entry, then back by deleting nothing.
    expect(designateMorning(db, g, d.entries.find((x) => !x.manual)!.sourceId, FB)).toBe(true);
    expect(weightData(db, FB).daily[0]!.weightKg).toBe(81.4);
  });
});

describe("editing", () => {
  it("edits and deletes manual entries only; deleting clears the designation", () => {
    const g = google(day(-1), 7, 0, 80.5);
    log(TODAY, 80.2);
    const m = weightData(db, FB).entries.find((e) => e.manual)!;
    expect(updateManualWeight(db, m.tMs, { kg: 79.9, note: "  new scale  " })).toBe(true);
    expect(weightData(db, FB).entries.find((e) => e.manual)).toMatchObject({ kg: 79.9, note: "new scale" });
    expect(updateManualWeight(db, g, { kg: 70 })).toBe(false); // Google: read-only
    expect(deleteManualWeight(db, g)).toBe(false);
    expect(deleteManualWeight(db, m.tMs)).toBe(true);
    expect(db.$client.prepare("select count(*) n from weight_day_choice").get()).toEqual({ n: 0 });
    expect(weightData(db, FB).entries).toHaveLength(1);
  });
  it("history entries still refuse duplicates within 30 min / 0.1 kg", () => {
    const t = zonedInstant(TODAY, 7, 0, TZ);
    expect(addManualWeight(db, { ...t, kg: 80, note: "x" })).toEqual({ ok: true });
    expect(addManualWeight(db, { ...t, tMs: t.tMs + 60_000, kg: 80.05 })).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("dashboard read model", () => {
  it("missing days are never zero; comparisons need enough weigh-ins", () => {
    for (const o of [-13, -12, -10, -6, -4, -2, 0]) log(day(o), 80 - (o + 13) * 0.1);
    const v = weightView(db, TODAY, FB, TZ, "30d");
    expect(v.points.map((p) => p.date)).toEqual([-13, -12, -10, -6, -4, -2, 0].map(day));
    expect(v.points.every((p) => p.kg > 70)).toBe(true);
    expect(v.week.change!.kg).toBeLessThan(0);
    expect(v.week.current!.n).toBe(4);
    expect(v.week.previous!.n).toBe(3);
    expect(v.consistency).toMatchObject({ logged: 7, days: 30, streak: 1 });
    expect(v.extremes!.min.date).toBe(TODAY);
    expect(v.todayWeight?.weightKg).toBeCloseTo(78.7, 6);
    expect(v.quick.recent[TODAY]).toMatchObject({ manual: true });
    // the metric registry and the calendar use the same daily value
    expect(metricSeries(db, METRIC_BY_ID.get("weight")!, day(-13), TODAY, FB).get(TODAY)).toBeCloseTo(78.7, 6);
    const cal = calendarView(db, "2026-03", TODAY, FB, TZ);
    expect(cal.days.find((d) => d.date === day(-11))!.weightKg).toBeNull();
    expect(cal.days.find((d) => d.date === TODAY)!.weightKg).toBeCloseTo(78.7, 6);
    expect(weightHistory(db, FB, TZ).days[0]!.entries[0]).toMatchObject({ day: true, manual: true });
  });
});

describe("phases", () => {
  const base = { kind: "cut" as const, name: "Spring cut", startDate: day(-20), startKg: 82, endDate: null, goalKg: 78, targetRateKgWeek: -0.5 };
  it("creates, closes the previous open phase, refuses overlaps, edits and deletes; history is kept", () => {
    const a = createPhase(db, base);
    expect(a.ok).toBe(true);
    const b = createPhase(db, { ...base, kind: "maintain", name: "Hold", startDate: day(-5), startKg: 80, goalKg: null, targetRateKgWeek: null });
    expect(b.ok).toBe(true);
    const [p1, p2] = listPhases(db);
    expect(p1).toMatchObject({ name: "Spring cut", endDate: day(-6) });
    expect(p2).toMatchObject({ name: "Hold", endDate: null });
    expect(createPhase(db, { ...base, startDate: day(-10) })).toMatchObject({ ok: false }); // inside the ended cut
    expect(updatePhase(db, p2!.id, { ...p2!, endDate: day(-1) }).ok).toBe(true);
    expect(createPhase(db, { ...base, name: "Bulk", kind: "bulk", startDate: TODAY, goalKg: 84 }).ok).toBe(true);
    for (let o = -20; o <= 0; o += 2) log(day(o), 82 - (o + 20) * 0.08);
    const v = weightView(db, TODAY, FB, TZ, "all");
    expect(v.currentPhase!.name).toBe("Bulk");
    expect(v.phases).toHaveLength(3);
    expect(v.phases.find((p) => p.phase.name === "Spring cut")!.progress.rate!.kgPerWeek).toBeLessThan(0);
    expect(deletePhase(db, p1!.id)).toBe(true);
    expect(listPhases(db)).toHaveLength(2);
  });
});

describe("data protection covers the new data", () => {
  it("backup, export and delete-all include notes, designations and phases", async () => {
    log(TODAY, 80.2, "fictional note");
    createPhase(db, { kind: "cut", name: "Cut", startDate: day(-3), startKg: 81, endDate: null, goalKg: 79, targetRateKgWeek: null });
    mkdirSync(path.join(home, "backups"));
    const b = await createBackup(db, "manual", path.join(home, "backups"));
    expect(verifyBackup(b.file).ok).toBe(true);
    const restored = openDatabase(b.file);
    expect(restored.$client.prepare("select count(*) n from weight_phases").get()).toEqual({ n: 1 });
    expect(restored.$client.prepare("select count(*) n from weight_day_choice").get()).toEqual({ n: 1 });
    restored.$client.close();
    const x = await exportAll(db, FB, home);
    expect(x.counts).toMatchObject({ weight_day_choice: 1, weight_phases: 1 });
    expect(readFileSync(path.join(x.dir, "observations.csv"), "utf8")).toContain("fictional note");
    deleteAllData(db, home);
    for (const t of ["weight_day_choice", "weight_phases", "observations"]) expect(db.$client.prepare(`select count(*) n from ${t}`).get()).toEqual({ n: 0 });
  });
});

describe("upgrade from 0.7.0", () => {
  it("migration 0004 only adds tables: existing weigh-ins survive and become usable", async () => {
    const { cpSync, writeFileSync } = await import("node:fs");
    const Database = (await import("better-sqlite3")).default;
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    // A migrations folder as shipped in 0.7.0 (0000–0003).
    const src = path.join(process.cwd(), "src/server/db/migrations"), old = path.join(home, "migrations-0.7.0");
    cpSync(src, old, { recursive: true });
    const journal = JSON.parse(readFileSync(path.join(old, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    journal.entries = journal.entries.filter((e) => e.tag !== "0004_weight_tracking");
    writeFileSync(path.join(old, "meta/_journal.json"), JSON.stringify(journal));
    rmSync(path.join(old, "0004_weight_tracking.sql"));
    const file = path.join(home, "old.db");
    const raw = new Database(file);
    const oldDb = drizzle(raw);
    migrate(oldDb, { migrationsFolder: old });
    expect(raw.prepare("select name from sqlite_master where name = 'weight_phases'").get()).toBeUndefined();
    raw.prepare("insert into sources (provider, key, platform, device_name) values ('google', 'scale', 'FITBIT', 'Smart scale')").run();
    raw.prepare("insert into observations (data_type, source_id, start_ms, end_ms, variant, utc_offset_s, value, unit) values ('weight', 1, ?, ?, '', 3600, 80.4, 'kg')").run(NOW, NOW);
    raw.close();
    const upgraded = openDatabase(file); // applies 0004
    const d = weightData(upgraded, FB);
    expect(d.entries).toHaveLength(1);
    expect(d.daily[0]).toMatchObject({ date: TODAY, weightKg: 80.4 });
    expect(logMorningWeight(upgraded, { date: TODAY, kg: 80.4, today: TODAY, nowMs: NOW, tz: TZ, fbOffsetS: FB })).toEqual({ ok: true, action: "linked" });
    upgraded.$client.close();
  });
});
