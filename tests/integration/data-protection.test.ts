import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { openDatabase, type DB } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { writeBatch, storeRawPage } from "@/server/store";
import { emptyBatch, type SourceDescriptor } from "@/server/providers/google/normalize";
import { autoBackupIfDue, createBackup, listBackups, pruneAutoBackups, verifyBackup } from "@/server/data/backup";
import { applyRetention } from "@/server/data/retention";
import { csvCell, exportAll, dailySummaryCsv } from "@/server/data/export";
import { deleteAllData } from "@/server/data/delete";
import { setSetting } from "@/server/settings";
import { saveHevyApiKey } from "@/server/connections";

// FICTIONAL data only, in a temporary BASELINE_HOME.
process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
const fitbit: SourceDescriptor = { provider: "google", platform: "FITBIT", deviceName: "Fitbit Air" };
const DAY = 86_400_000;
let home: string, db: DB;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "baseline-dp-"));
  db = openDatabase(path.join(home, "data", "baseline.db"));
  const b = emptyBatch();
  for (let i = 0; i < 10; i++) b.hr.push({ source: fitbit, tMs: Date.UTC(2026, 2, 2, 8) + i * 3000, utcOffsetS: 3600, bpm: 60 + i, motion: null });
  b.daily.push({ source: fitbit, metric: "resting_hr", date: "2026-03-02", value: 55, unit: "bpm" });
  writeBatch(db, b, null);
});
afterEach(() => { db.$client.close(); rmSync(home, { recursive: true, force: true }); });

describe("backups", () => {
  it("creates a consistent backup that verifies, and lists it", async () => {
    const dir = path.join(home, "backups"); mkdirSync(dir);
    const b = await createBackup(db, "manual", dir);
    expect(listBackups(dir).map((x) => x.kind)).toEqual(["manual"]);
    const v = verifyBackup(b.file);
    expect(v).toMatchObject({ ok: true, problems: [] });
    expect(v.counts.heart_rate_samples).toBe(10);
  });
  it("rejects a file that is not a Baseline database", () => {
    const f = path.join(home, "not-a-db.db"); writeFileSync(f, "hello");
    expect(verifyBackup(f).ok).toBe(false);
  });
  it("makes one automatic backup per 24 h and prunes only automatic ones", async () => {
    const dir = path.join(home, "backups"); mkdirSync(dir);
    const now = Date.now();
    expect(await autoBackupIfDue(db, 2, now, dir)).not.toBeNull();
    expect(await autoBackupIfDue(db, 2, now + 3_600_000, dir)).toBeNull();
    await createBackup(db, "manual", dir);
    // Pretend older automatic backups exist.
    for (const s of ["2026-01-01T00-00-00-000Z", "2026-01-02T00-00-00-000Z"]) writeFileSync(path.join(dir, `baseline-${s}-auto.db`), "x");
    expect(pruneAutoBackups(2, dir)).toBe(1);
    const kinds = listBackups(dir).map((b) => b.kind).sort();
    expect(kinds).toEqual(["auto", "auto", "manual"]);
  });
});

describe("retention", () => {
  it("drops old raw API pages (clearing provenance), old exports and old sync runs; never measurements", () => {
    const old = storeRawPage(db, "google", "heart-rate:list", "k-old", 200, "{}");
    const fresh = storeRawPage(db, "google", "heart-rate:list", "k-new", 200, "{\"a\":1}");
    db.$client.prepare("update raw_pages set fetched_at = ? where id = ?").run(Date.now() - 200 * DAY, old);
    db.$client.prepare("update heart_rate_samples set raw_page_id = ?").run(old);
    db.insert(t.syncRuns).values({ provider: "google", trigger: "scheduled", startedAt: Date.now() - 100 * DAY, finishedAt: Date.now() - 100 * DAY, status: "success" }).run();
    const exp = path.join(home, "exports", "baseline-export-old"); mkdirSync(exp, { recursive: true });
    utimesSync(exp, new Date(Date.now() - 10 * DAY), new Date(Date.now() - 10 * DAY));
    setSetting(db, "rawRetentionDays", 90);
    const r = applyRetention(db, Date.now(), home);
    expect(r).toMatchObject({ rawPages: 1, syncRuns: 1, exports: 1 });
    expect(db.select().from(t.rawPages).all().map((p) => p.id)).toEqual([fresh]);
    expect(db.select().from(t.heartRateSamples).all()).toHaveLength(10);
    expect(db.select().from(t.heartRateSamples).all().every((s) => s.rawPageId === null)).toBe(true);
    expect(existsSync(exp)).toBe(false);
  });
  it("rawRetentionDays = 0 keeps raw pages forever", () => {
    const id = storeRawPage(db, "google", "x", "k", 200, "{}");
    db.$client.prepare("update raw_pages set fetched_at = ? where id = ?").run(Date.now() - 1000 * DAY, id);
    setSetting(db, "rawRetentionDays", 0);
    expect(applyRetention(db, Date.now(), home).rawPages).toBe(0);
  });
});

describe("export", () => {
  it("writes every data table as CSV, never credentials or raw responses", async () => {
    saveHevyApiKey(db, "fictional-key-not-real");
    const r = await exportAll(db, 3600, home);
    const files = readdirSync(r.dir);
    expect(files).toEqual(expect.arrayContaining(["heart_rate_samples.csv", "daily_metrics.csv", "daily_summary.csv", "README.txt", "manifest.json"]));
    expect(files.some((f) => f.startsWith("provider_connections") || f.startsWith("raw_pages"))).toBe(false);
    const hr = readFileSync(path.join(r.dir, "heart_rate_samples.csv"), "utf8").trim().split("\n");
    expect(hr).toHaveLength(11);
    expect(hr[0]).toContain("t_ms,t_ms_iso");
    expect(readFileSync(path.join(r.dir, "settings.csv"), "utf8")).not.toContain("fictional-key");
  });
  it("CSV cells are escaped and spreadsheet formulas neutralised", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });
  it("daily summary leaves missing days empty (never 0)", () => {
    const { csv } = dailySummaryCsv(db, 3600);
    const lines = csv.trim().split("\n");
    const header = lines[0]!.split(",");
    const col = header.findIndex((h) => h.startsWith("resting_hr"));
    const row = lines.find((l) => l.startsWith("2026-03-02"))!.split(",");
    expect(row[col]).toBe("55");
    const next = lines.find((l) => l.startsWith("2026-03-03"))?.split(",");
    expect(next?.[col]).toBe("");
  });
});

describe("delete all", () => {
  it("erases every table and the backup/export/log files; the database still opens", async () => {
    mkdirSync(path.join(home, "backups")); await createBackup(db, "manual", path.join(home, "backups"));
    mkdirSync(path.join(home, "logs")); writeFileSync(path.join(home, "logs", "server-2026-03-02.log"), "x");
    saveHevyApiKey(db, "fictional-key-not-real");
    const r = deleteAllData(db, home);
    expect(r.rows).toBeGreaterThan(10);
    for (const tbl of ["heart_rate_samples", "daily_metrics", "provider_connections", "sources"]) {
      expect((db.$client.prepare(`select count(*) n from ${tbl}`).get() as { n: number }).n).toBe(0);
    }
    expect(readdirSync(path.join(home, "backups"))).toHaveLength(0);
    expect(readdirSync(path.join(home, "logs"))).toHaveLength(0);
    // Migrations are kept, so the app starts normally on the empty database.
    db.$client.close();
    db = openDatabase(path.join(home, "data", "baseline.db"));
    expect(db.select().from(t.heartRateSamples).all()).toHaveLength(0);
  });
});
