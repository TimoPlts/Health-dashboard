/**
 * Real-data probe for the Google Health API.
 *
 * Requires: Google connected via the web app (Settings → Connect Google Health).
 * Reports STRUCTURE ONLY — never health values — so the output can be shared when debugging:
 *  - per stream: OK_DATA / OK_EMPTY (valid response, no data in the window) / ERROR (HTTP status + API reason)
 *  - point counts over all pages, JSON field paths, data sources, normalizer skip counts
 *  - heart-rate sampling resolution (median / p10 / p90 interval, seconds)
 *  - consistency: per-day Σ reconciled intervals vs Google's dailyRollUp, as relative differences only
 *  - history depth (`--history`): earliest civil date with data for key types
 * The JSON report goes to <BASELINE_HOME>/probe-output (outside the repo and OneDrive).
 *
 *   npm run probe:google                 # last 3 days
 *   npm run probe:google -- 14           # last 14 days
 *   npm run probe:google -- 3 --history  # also find how far back data goes
 */
import "./_env";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../src/server/env";
import { ensureSafeDir, runtimePaths } from "../src/server/runtime-home";
import { openDatabase } from "../src/server/db/client";
import { getGoogleAccessToken } from "../src/server/connections";
import { GoogleHealthClient } from "../src/server/providers/google/client";
import { normalizeGoogle, normalizeGoogleDailyRollup, sourceFromDataPoint, sourceKey, unionField } from "../src/server/providers/google/normalize";
import { buildFilter, GOOGLE_STREAMS, rollupRange, streamId, type GoogleStream } from "../src/server/providers/google/streams";
import { HttpError } from "../src/server/http";
import { medianInterval } from "../src/lib/metrics/heart-rate";
import { civilDate } from "../src/lib/time";

const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const withHistory = args.includes("--history");
const tz = env().HOME_TIME_ZONE;
const db = openDatabase(env().DATABASE_PATH);
const client = new GoogleHealthClient(() => getGoogleAccessToken(db), {}, async () => { await getGoogleAccessToken(db, { force: true }); });
const DAY = 86_400_000;
const MAX_PAGES = 20;

type J = Record<string, unknown>;
function paths(v: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { v.slice(0, 3).forEach((x) => paths(x, `${prefix}[]`, out)); return out; }
  if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) paths(x, prefix ? `${prefix}.${k}` : k, out); return out; }
  out.add(prefix);
  return out;
}
/** Error text without values: status + API reason codes. */
function describe(e: unknown): string {
  if (!(e instanceof HttpError)) return e instanceof Error ? e.message : String(e);
  try {
    const j = JSON.parse(e.bodySnippet) as { error?: { status?: string; message?: string } };
    return `HTTP ${e.status} ${j.error?.status ?? ""}: ${j.error?.message ?? ""}`.trim();
  } catch {
    const m = /"message":\s*"([^"]*)"/.exec(e.bodySnippet);
    return `HTTP ${e.status}: ${m?.[1] ?? e.bodySnippet.slice(0, 200)}`;
  }
}
function pagesFor(s: GoogleStream, start: number, end: number) {
  if (s.method === "dailyRollUp") {
    const [fromDate, toDate] = rollupRange(start, end);
    return client.dailyRollUp({ dataType: s.dataType, fromDate, toDate, pageSize: s.pageSize, dataSourceFamily: s.family });
  }
  return client.pages({ dataType: s.dataType, method: s.method, filter: buildFilter(s, start, end, tz), pageSize: s.pageSize, dataSourceFamily: s.family });
}
async function collect(s: GoogleStream, start: number, end: number) {
  const dps: J[] = []; let pages = 0, truncated = false;
  for await (const p of pagesFor(s, start, end)) {
    dps.push(...p.dataPoints); pages++;
    if (pages >= MAX_PAGES) { truncated = true; break; }
  }
  return { dps, pages, truncated };
}

const end = Math.ceil(Date.now() / DAY) * DAY;
const start = end - days * DAY;
const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), days, timeZone: tz };
const summary: Record<string, string> = {};

try {
  const id = await client.getIdentity();
  report.identity = { ok: true, fields: Object.keys(id) };
  console.log(`identity OK`);
} catch (e) {
  report.identity = { ok: false, error: describe(e) };
  console.error("identity FAILED:", describe(e));
}

console.log(`\nStreams (last ${days} days):`);
for (const s of GOOGLE_STREAMS) {
  const sid = streamId(s);
  // Rollups for 14-day-limited types must stay within 14 days.
  const st = s.method === "dailyRollUp" ? Math.max(start, end - 14 * DAY) : start;
  const entry: J = { method: s.method, family: s.family ?? null, filter: s.method === "dailyRollUp" ? rollupRange(st, end).join("..") : buildFilter(s, st, end, tz) };
  try {
    const { dps, pages, truncated } = await collect(s, st, end);
    const norm = s.method === "dailyRollUp" ? normalizeGoogleDailyRollup(s.dataType, dps) : normalizeGoogle(s.dataType, dps);
    const fieldPaths = new Set<string>();
    dps.slice(0, 200).forEach((dp) => paths(dp, "", fieldPaths));
    const status = dps.length ? "OK_DATA" : "OK_EMPTY";
    Object.assign(entry, {
      status, points: dps.length, pages, truncated,
      normalized: { hr: norm.hr.length, obs: norm.obs.length, daily: norm.daily.length, sleep: norm.sleep.length, exercise: norm.exercise.length, skipped: norm.skipped },
      fieldPaths: [...fieldPaths].filter((f) => !/\.civil(Start|End)?Time\.|civilTime\./.test(f)).sort(),
      sources: [...new Set(dps.map((dp) => sourceKey(sourceFromDataPoint(dp))))],
    });
    if (s.dataType === "heart-rate" && s.method === "list" && norm.hr.length > 1) {
      const sorted = [...norm.hr].sort((a, b) => a.tMs - b.tMs);
      const gaps = sorted.slice(1).map((x, i) => (x.tMs - sorted[i]!.tMs) / 1000).sort((a, b) => a - b);
      const q = (p: number) => gaps[Math.floor(gaps.length * p)];
      entry.resolution = {
        medianIntervalS: medianInterval(sorted), p10S: q(0.1), p90S: q(0.9), p99S: q(0.99),
        shareWithin10s: +(gaps.filter((g) => g <= 10).length / gaps.length).toFixed(3),
        gapsOver10min: gaps.filter((g) => g > 600).length,
      };
    }
    summary[sid] = `${status}${dps.length ? ` ${dps.length}${truncated ? "+" : ""}` : ""}${norm.skipped ? ` (skipped ${norm.skipped})` : ""}`;
  } catch (e) {
    Object.assign(entry, { status: "ERROR", error: describe(e) });
    summary[sid] = `ERROR ${describe(e).slice(0, 160)}`;
  }
  report[sid] = entry;
  const res = entry.resolution as { medianIntervalS: number; p90S: number; shareWithin10s: number } | undefined;
  console.log(`  ${sid.padEnd(38)} ${summary[sid]}${res ? `  Δt median ${res.medianIntervalS}s p90 ${res.p90S}s, ${Math.round(res.shareWithin10s * 100)}% ≤10s` : ""}`);
}

// Consistency: reconciled intervals summed per civil day vs dailyRollUp (relative differences only).
console.log(`\nDouble-count check — per-day Σ(reconcile) vs dailyRollUp, and Σ(raw list, all sources) vs dailyRollUp:`);
const consistency: J = {};
for (const [dataType, rollupField, rollupValue, pointValue] of [
  ["steps", "steps", (v: J) => Number(v.countSum), (p: J) => Number(p.count)],
  ["distance", "distance", (v: J) => Number(v.millimetersSum), (p: J) => Number(p.millimeters)],
  ["active-energy-burned", "activeEnergyBurned", (v: J) => Number(v.kcalSum), (p: J) => Number(p.kcal)],
  ["floors", "floors", (v: J) => Number(v.countSum), (p: J) => Number(p.count)],
] as const) {
  const s = GOOGLE_STREAMS.find((x) => x.dataType === dataType)!;
  const sumPerDay = (dps: J[]) => {
    const m = new Map<string, number>();
    for (const dp of dps) {
      const p = dp[unionField(dataType)] as J, iv = p.interval as J;
      const off = typeof iv.startUtcOffset === "string" ? parseFloat(iv.startUtcOffset) : null;
      const k = civilDate(Date.parse(iv.startTime as string), off, tz);
      m.set(k, (m.get(k) ?? 0) + pointValue(p));
    }
    return m;
  };
  try {
    const rec = sumPerDay((await collect(s, start, end)).dps);
    // floors has no `list` method (reconcile/rollUp only), so there is no raw multi-source sum to compare.
    const raw = dataType === "floors" ? new Map<string, number>() : sumPerDay((await collect({ ...s, method: "list" }, start, end)).dps);
    const roll = new Map<string, number>();
    for await (const p of client.dailyRollUp({ dataType, fromDate: rollupRange(start, end)[0], toDate: rollupRange(start, end)[1] })) {
      for (const dp of p.dataPoints) {
        const v = dp[rollupField] as J | undefined, date = (dp.civilStartTime as J | undefined)?.date as J | undefined;
        if (v && date) roll.set(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`, rollupValue(v));
      }
    }
    const rel = (a?: number, b?: number) => (a === undefined || b === undefined ? null : b === 0 ? (a === 0 ? 0 : null) : +(((a - b) / b) * 100).toFixed(2));
    const rows = [...roll.keys()].sort().map((d) => ({ date: d, reconcileVsRollupPct: rel(rec.get(d), roll.get(d)), rawListVsRollupPct: rel(raw.get(d), roll.get(d)) }));
    const maxRec = Math.max(0, ...rows.map((r) => Math.abs(r.reconcileVsRollupPct ?? 0)));
    const maxRaw = Math.max(0, ...rows.map((r) => Math.abs(r.rawListVsRollupPct ?? 0)));
    consistency[dataType] = { rows, maxAbsReconcileDiffPct: maxRec, maxAbsRawListDiffPct: maxRaw };
    console.log(`  ${dataType.padEnd(22)} days ${rows.length}  max |Σreconcile − rollup| ${maxRec}%   max |Σraw − rollup| ${maxRaw}%`);
  } catch (e) {
    consistency[dataType] = { error: describe(e) };
    console.log(`  ${dataType.padEnd(22)} ERROR ${describe(e)}`);
  }
}
report.consistency = consistency;

if (withHistory) {
  // Earliest day with data, via dailyRollUp (90-day chunks; 14 for heart-rate) walking back up to 3 years.
  console.log(`\nHistory depth (earliest civil date with data):`);
  const history: J = {};
  for (const [dataType, field, chunk] of [["heart-rate", "heartRate", 14], ["steps", "steps", 90], ["total-calories", "totalCalories", 14]] as const) {
    let earliest: string | null = null, emptyRun = 0;
    for (let e = end; e > end - 3 * 365 * DAY && emptyRun < (chunk === 14 ? 6 : 2); e -= chunk * DAY) {
      const [fromDate, toDate] = rollupRange(e - chunk * DAY, e);
      let found: string | null = null;
      for await (const p of client.dailyRollUp({ dataType, fromDate, toDate, pageSize: chunk })) {
        for (const dp of p.dataPoints) {
          if (!dp[field]) continue;
          const d = (dp.civilStartTime as J).date as J;
          const ds = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
          if (!found || ds < found) found = ds;
        }
      }
      if (found) { earliest = found; emptyRun = 0; } else emptyRun++;
    }
    history[dataType] = earliest;
    console.log(`  ${dataType.padEnd(22)} ${earliest ?? "none found"}`);
  }
  report.history = history;
}

const outDir = ensureSafeDir(runtimePaths().probeOutput);
const file = path.join(outDir, `google-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
const errors = Object.values(summary).filter((v) => v.startsWith("ERROR")).length;
console.log(`\n${Object.keys(summary).length} streams: ${Object.keys(summary).length - errors} OK, ${errors} errors.`);
console.log(`Structure report written to ${file} (contains no health values).`);
