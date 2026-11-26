/**
 * Phase-1 real-data probe for the Google Health API.
 *
 * Requires: Google connected via the web app (Settings → Connect Google Health).
 * For every configured stream it fetches the last N days (first page only) and reports STRUCTURE ONLY:
 * HTTP status, point count, JSON field paths present, data sources, and — for heart rate — the observed
 * sampling interval. No health values are printed. A JSON report is written to probe-output/ (outside the repo, in your Baseline folder).
 *
 *   npm run probe:google            # last 3 days
 *   npm run probe:google -- 14      # last 14 days
 */
import "./_env";
import { writeFileSync } from "node:fs";
import { env } from "../src/server/env";
import { ensureSafeDir, runtimePaths } from "../src/server/runtime-home";
import path from "node:path";
import { openDatabase } from "../src/server/db/client";
import { getGoogleAccessToken } from "../src/server/connections";
import { GoogleHealthClient } from "../src/server/providers/google/client";
import { normalizeGoogle, sourceKey, sourceFromDataPoint } from "../src/server/providers/google/normalize";
import { buildFilter, GOOGLE_STREAMS } from "../src/server/providers/google/streams";
import { HttpError } from "../src/server/http";
import { medianInterval } from "../src/lib/metrics/heart-rate";

const days = Number(process.argv[2] ?? 3);
const db = openDatabase(env().DATABASE_PATH);
const client = new GoogleHealthClient(() => getGoogleAccessToken(db), {}, async () => { await getGoogleAccessToken(db, { force: true }); });

function paths(v: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { v.slice(0, 3).forEach((x) => paths(x, `${prefix}[]`, out)); return out; }
  if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) paths(x, prefix ? `${prefix}.${k}` : k, out); return out; }
  out.add(prefix);
  return out;
}

const now = Date.now();
const end = Math.ceil(now / 86_400_000) * 86_400_000;
const start = end - days * 86_400_000;
const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), days };

try {
  const id = await client.getIdentity();
  report.identity = { fields: Object.keys(id) };
  console.log(`identity OK (fields: ${Object.keys(id).join(", ")})`);
} catch (e) {
  report.identity = { error: e instanceof Error ? e.message : String(e) };
  console.error("identity FAILED:", report.identity);
}

for (const s of GOOGLE_STREAMS) {
  const entry: Record<string, unknown> = { method: s.method, filter: buildFilter(s, start, end), family: s.family ?? null };
  try {
    const it = client.pages({ dataType: s.dataType, method: s.method, filter: entry.filter as string, pageSize: Math.min(s.pageSize, 10000), dataSourceFamily: s.family });
    const first = (await it.next()).value;
    const dps: Record<string, unknown>[] = first?.dataPoints ?? [];
    const fieldPaths = new Set<string>();
    dps.slice(0, 50).forEach((dp) => paths(dp, "", fieldPaths));
    const sources = [...new Set(dps.map((dp) => sourceKey(sourceFromDataPoint(dp))))];
    const norm = normalizeGoogle(s.dataType, dps);
    Object.assign(entry, {
      ok: true, points: dps.length, morePages: Boolean(first && JSON.parse(first.bodyText).nextPageToken),
      normalized: { hr: norm.hr.length, obs: norm.obs.length, daily: norm.daily.length, sleep: norm.sleep.length, exercise: norm.exercise.length, skipped: norm.skipped },
      fieldPaths: [...fieldPaths].sort(), sources,
    });
    if (s.dataType === "heart-rate" && norm.hr.length > 1) {
      const sorted = [...norm.hr].sort((a, b) => a.tMs - b.tMs);
      const gaps = sorted.slice(1).map((x, i) => (x.tMs - sorted[i]!.tMs) / 1000).sort((a, b) => a - b);
      entry.resolution = { medianIntervalS: medianInterval(sorted), p10S: gaps[Math.floor(gaps.length * 0.1)], p90S: gaps[Math.floor(gaps.length * 0.9)], spanHours: (sorted.at(-1)!.tMs - sorted[0]!.tMs) / 3.6e6 };
    }
    console.log(`${s.dataType.padEnd(38)} ${String(dps.length).padStart(6)} pts  skipped ${norm.skipped}${entry.resolution ? `  median Δt ${(entry.resolution as { medianIntervalS: number }).medianIntervalS}s` : ""}`);
  } catch (e) {
    Object.assign(entry, { ok: false, error: e instanceof HttpError ? `HTTP ${e.status}: ${e.bodySnippet}` : String(e) });
    console.log(`${s.dataType.padEnd(38)} ERROR ${String(entry.error).slice(0, 160)}`);
  }
  report[s.dataType] = entry;
}

const outDir = ensureSafeDir(runtimePaths().probeOutput);
const file = path.join(outDir, `google-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\nStructure report written to ${file} (contains no health values).`);
