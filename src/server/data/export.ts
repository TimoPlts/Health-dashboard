import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { DB } from "../db/client";
import { ensureSafeDir, runtimePaths } from "../runtime-home";
import { METRICS } from "../analytics/registry";
import { metricSeries } from "../analytics/values";
import { dateRange } from "../analytics/series";

/**
 * Personal data export: everything Baseline stores about you, as CSV files in
 * <BASELINE_HOME>/exports/baseline-export-<timestamp>/ (outside OneDrive; deleted automatically after 7 days).
 *
 * Included: every measurement table, workouts, exclusions, derived metrics, settings, sync history.
 * Excluded on purpose: provider credentials (provider_connections: encrypted tokens, useless outside this install),
 * raw API responses (raw_pages: a compressed cache of the same data) and migration bookkeeping.
 * Times are epoch milliseconds (UTC) with an extra ISO-8601 column next to each.
 */
export const EXPORT_TABLES = [
  "heart_rate_samples", "observations", "daily_metrics", "sleep_sessions", "sleep_stages", "exercise_sessions",
  "exercise_exclusions", "derived_daily", "sources", "settings", "sync_runs", "sync_state",
  "hevy_workouts", "hevy_exercises", "hevy_sets", "hevy_exercise_templates",
] as const;

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = Buffer.isBuffer(v) ? `<${v.length} bytes>` : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Text that a spreadsheet would run as a formula gets a leading apostrophe (OWASP CSV injection guidance).
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const isTimeCol = (c: string) => /(_ms|_at)$/.test(c);
const iso = (v: unknown) => (typeof v === "number" && v > 946_684_800_000 ? new Date(v).toISOString() : "");

/** Stream one table to CSV (handles millions of heart-rate rows without loading them into memory). */
async function tableToCsv(db: DB, table: string, file: string): Promise<number> {
  const c = db.$client;
  const exists = c.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table);
  if (!exists) return -1;
  const cols = (c.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((x) => x.name);
  const out = createWriteStream(file, { encoding: "utf8" });
  const header = cols.flatMap((col) => (isTimeCol(col) ? [col, `${col}_iso`] : [col]));
  out.write(`${header.join(",")}\n`);
  let n = 0;
  for (const row of c.prepare(`select * from ${table}`).iterate() as Iterable<Record<string, unknown>>) {
    const line = cols.flatMap((col) => (isTimeCol(col) ? [csvCell(row[col]), iso(row[col])] : [csvCell(row[col])])).join(",");
    if (!out.write(`${line}\n`)) await once(out, "drain");
    n++;
  }
  out.end();
  await once(out, "finish");
  return n;
}

export async function exportAll(db: DB, fbOffsetS: number, home = runtimePaths().home) {
  const dir = path.join(ensureSafeDir(path.join(home, "exports")), `baseline-export-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const t of EXPORT_TABLES) {
    const n = await tableToCsv(db, t, path.join(dir, `${t}.csv`));
    if (n >= 0) counts[t] = n;
  }
  const daily = dailySummaryCsv(db, fbOffsetS);
  writeFileSync(path.join(dir, "daily_summary.csv"), daily.csv);
  counts.daily_summary = daily.days;
  writeFileSync(path.join(dir, "README.txt"), [
    "Baseline personal data export",
    `Created: ${new Date().toISOString()}`,
    "",
    "daily_summary.csv  one row per day, one column per Baseline metric (same values as the app; empty = no data).",
    "Other files        one CSV per database table. Times: epoch milliseconds (UTC) plus an *_iso column.",
    "Not included       provider credentials (encrypted tokens) and raw API responses (a cache of the same data).",
    "Methods            docs/CALCULATIONS.md in the Baseline repository.",
    "",
    "This folder is deleted automatically after 7 days. Move it somewhere private if you want to keep it",
    "(not a cloud-synced folder unless you intend to upload your health data).",
  ].join("\r\n"));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), counts }, null, 2));
  return { dir, counts };
}

/** All registered metrics per day, from the first to the last day with any data. Missing → empty cell, never 0. */
export function dailySummaryCsv(db: DB, fbOffsetS: number): { csv: string; days: number } {
  const first = (db.$client.prepare("select min(date) as d from daily_metrics").get() as { d: string | null }).d;
  const today = new Date(Date.now() + fbOffsetS * 1000).toISOString().slice(0, 10);
  const firstHr = (db.$client.prepare("select min(t_ms) as t from heart_rate_samples").get() as { t: number | null }).t;
  const start = [first, firstHr ? new Date(firstHr + fbOffsetS * 1000).toISOString().slice(0, 10) : null].filter(Boolean).sort()[0];
  const header = ["date", ...METRICS.map((m) => `${m.id}${m.unit ? ` (${m.unit})` : ""}`)].map(csvCell).join(",");
  if (!start) return { csv: `${header}\n`, days: 0 };
  const series = METRICS.map((m) => metricSeries(db, m, start, today, fbOffsetS));
  const dates = dateRange(start, today);
  const rows = dates.map((d) => [d, ...series.map((s) => { const v = s.get(d); return v === undefined ? "" : String(Math.round(v * 1000) / 1000); })].join(","));
  return { csv: [header, ...rows].join("\n") + "\n", days: dates.length };
}
