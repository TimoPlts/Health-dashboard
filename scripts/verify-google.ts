/**
 * Verifies the imported Google data in the local database against Google's own daily aggregates and internal
 * consistency rules. By default it prints ONLY differences and pass/fail — no health values — so the output can be
 * shared when debugging. `--show-values` prints your actual daily numbers (for comparing with the Google Health app
 * yourself; do not paste that output anywhere).
 *
 *   npm run verify:google               # last 7 days
 *   npm run verify:google -- 30
 *   npm run verify:google -- 7 --show-values
 */
import "./_env";
import { sql } from "drizzle-orm";
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";
import { civilDayBounds } from "../src/lib/time";

const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 7);
const showValues = args.includes("--show-values");
const tz = env().HOME_TIME_ZONE;
const db = openDatabase(env().DATABASE_PATH);
const all = <T>(q: ReturnType<typeof sql>) => db.all(q) as T[];
const one = <T>(q: ReturnType<typeof sql>) => db.get(q) as T;

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const pct = (a: number | null, b: number | null) => (a === null || b === null ? null : b === 0 ? (a === 0 ? 0 : Infinity) : ((a - b) / b) * 100);
const fmt = (p: number | null) => (p === null ? "n/a" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const dates = Array.from({ length: days }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
const daily = (metric: string, date: string) => one<{ v: number | null }>(sql`select value as v from daily_metrics where metric = ${metric} and date = ${date}`)?.v ?? null;
const intervalSum = (type: string, s: number, e: number) => {
  const r = one<{ v: number | null; n: number }>(sql`select sum(value) as v, count(*) as n from observations where data_type = ${type} and start_ms >= ${s} and start_ms < ${e}`);
  return r.n ? r.v : null;
};

console.log(`Baseline — Google data verification (${days} days, ${tz})\n`);

// 1) Daily totals: Σ reconciled intervals in the DB vs Google's dailyRollUp. total-calories is rollup-only.
console.log("1. Daily activity totals vs Google (dailyRollUp total-calories; Σ reconciled intervals are cross-checked in probe:google)");
for (const d of dates) {
  const [s, e] = civilDayBounds(d, tz);
  const steps = intervalSum("steps", s, e), active = intervalSum("active-energy-burned", s, e), dist = intervalSum("distance", s, e);
  const total = daily("total_kcal", d);
  if (showValues) console.log(`  ${d}  steps ${steps ?? "—"}  distance ${dist === null ? "—" : (dist / 1000).toFixed(2) + " km"}  active ${active === null ? "—" : Math.round(active) + " kcal"}  total ${total === null ? "—" : Math.round(total) + " kcal"}`);
  if (active !== null && total !== null) check(active <= total, `${d} active kcal ≤ total kcal`);
}

// 2) Heart rate: per-day stats from stored samples vs Google's heart-rate dailyRollUp.
console.log("\n2. Heart rate: stored 3-s samples vs Google daily min / avg / max");
for (const d of dates) {
  const [s, e] = civilDayBounds(d, tz);
  const r = one<{ n: number; mn: number | null; mx: number | null; avg: number | null }>(
    sql`select count(*) as n, min(bpm) as mn, max(bpm) as mx, avg(bpm) as avg from heart_rate_samples where t_ms >= ${s} and t_ms < ${e}`);
  const g = { min: daily("hr_day_min", d), avg: daily("hr_day_avg", d), max: daily("hr_day_max", d) };
  if (!r.n && g.avg === null) continue;
  if (showValues) console.log(`  ${d}  samples ${r.n}  ours min/avg/max ${r.mn}/${r.avg?.toFixed(1)}/${r.mx}  google ${g.min ?? "—"}/${g.avg?.toFixed(1) ?? "—"}/${g.max ?? "—"}`);
  if (g.avg === null || !r.n) { check(false, `${d} HR present in both`, `samples ${r.n ? "yes" : "no"}, rollup ${g.avg === null ? "no" : "yes"}`); continue; }
  const dMin = Math.abs((r.mn ?? 0) - (g.min ?? 0)), dMax = Math.abs((r.mx ?? 0) - (g.max ?? 0)), dAvg = Math.abs((r.avg ?? 0) - g.avg);
  check(dMin <= 1 && dMax <= 1 && dAvg <= 1.5, `${d} HR min/max within 1 bpm, avg within 1.5 bpm of Google`, `Δmin ${dMin} Δmax ${dMax} Δavg ${dAvg.toFixed(2)} bpm, ${r.n} samples`);
}

// 3) Sampling resolution & timestamps.
console.log("\n3. Heart-rate sampling and timestamps");
const gaps = all<{ g: number }>(sql`select (t_ms - lag(t_ms) over (order by t_ms)) / 1000.0 as g from heart_rate_samples`).map((x) => x.g).filter((g) => g !== null).sort((a, b) => a - b);
if (gaps.length) {
  const q = (p: number) => gaps[Math.floor(gaps.length * p)]!;
  console.log(`  interval median ${q(0.5)} s, p10 ${q(0.1)} s, p90 ${q(0.9)} s, p99 ${q(0.99)} s; gaps > 10 min: ${gaps.filter((g) => g > 600).length}`);
}
const off = one<{ n: number; withOff: number }>(sql`select count(*) as n, sum(utc_offset_s is not null) as withOff from heart_rate_samples`);
check(off.n === 0 || off.withOff === off.n, "every HR sample carries its UTC offset", `${off.withOff}/${off.n}`);
const offsets = all<{ o: number }>(sql`select distinct utc_offset_s as o from heart_rate_samples`).map((x) => x.o);
console.log(`  distinct UTC offsets seen: ${offsets.map((o) => `${o / 3600 >= 0 ? "+" : ""}${o / 3600}h`).join(", ") || "none"}`);

// 4) Duplicates / double counting.
console.log("\n4. Duplicates and double counting");
const hrDup = one<{ n: number }>(sql`select count(*) as n from (select t_ms from heart_rate_samples group by t_ms having count(*) > 1)`).n;
check(hrDup === 0, "no HR timestamp stored twice (across sources)", `${hrDup} duplicated timestamps`);
for (const type of ["steps", "distance", "active-energy-burned", "floors", "active-zone-minutes", "time-in-heart-rate-zone", "activity-level"]) {
  const ov = one<{ n: number }>(sql`
    select count(*) as n from (
      select start_ms, lag(end_ms) over (partition by variant order by start_ms) as prev_end
      from observations where data_type = ${type}) where prev_end > start_ms`).n;
  check(ov === 0, `${type}: no overlapping intervals (reconciled)`, `${ov} overlaps`);
}
const srcPerType = all<{ t: string; n: number }>(sql`select data_type as t, count(distinct source_id) as n from observations group by data_type`);
for (const r of srcPerType.filter((x) => ["steps", "distance", "active-energy-burned"].includes(x.t))) check(r.n === 1, `${r.t}: stored from a single (reconciled) source`, `${r.n} sources`);
const exSrc = all<{ p: string; app: string | null; n: number }>(sql`
  select s.platform as p, s.app_package as app, count(*) as n from exercise_sessions e join sources s on s.id = e.source_id group by 1, 2`);
console.log(`  exercise sessions by source: ${exSrc.map((x) => `${x.p}${x.app ? `/${x.app}` : ""} ×${x.n}`).join(", ") || "none"}`);
const exOverlap = one<{ n: number }>(sql`
  select count(*) as n from exercise_sessions a join exercise_sessions b on a.id < b.id and a.start_ms < b.end_ms and b.start_ms < a.end_ms`).n;
console.log(`  overlapping exercise sessions (same activity from several sources, kept separate by provenance): ${exOverlap}`);

// 5) Sleep integrity.
console.log("\n5. Sleep sessions");
const sessions = all<{ id: string; s: number; e: number; summary: string | null; type: string | null }>(sql`select id, start_ms as s, end_ms as e, summary, sleep_type as type from sleep_sessions`);
for (const ses of sessions) {
  const stages = all<{ s: number; e: number; stage: string }>(sql`select start_ms as s, end_ms as e, stage from sleep_stages where session_id = ${ses.id} and is_short_awakening = 0 order by start_ms`);
  const summary = ses.summary ? (JSON.parse(ses.summary) as Record<string, unknown>) : {};
  const asleepStages = stages.filter((x) => x.stage !== "AWAKE").reduce((a, x) => a + (x.e - x.s) / 60_000, 0);
  const asleepSummary = Number(summary.minutesAsleep);
  const inPeriod = Number(summary.minutesInSleepPeriod), span = (ses.e - ses.s) / 60_000;
  const within = stages.every((x) => x.s >= ses.s && x.e <= ses.e);
  let overlaps = 0; for (let i = 1; i < stages.length; i++) if (stages[i]!.s < stages[i - 1]!.e) overlaps++;
  const label = `sleep ${new Date(ses.e).toISOString().slice(0, 10)} (${ses.type}, ${stages.length} stages)`;
  check(within && overlaps === 0, `${label}: stages inside session, no overlaps`, `${overlaps} overlaps`);
  if (Number.isFinite(asleepSummary)) check(Math.abs(asleepStages - asleepSummary) <= 5, `${label}: Σ non-awake stages ≈ minutesAsleep`, `Δ ${(asleepStages - asleepSummary).toFixed(1)} min`);
  if (Number.isFinite(inPeriod)) console.log(`        minutesInSleepPeriod vs session span: Δ ${(inPeriod - span).toFixed(1)} min`);
}

// 6) Daily summary coverage.
console.log("\n6. Coverage per metric (days with a value / days checked)");
for (const m of ["resting_hr", "hrv_rmssd_daily", "spo2_avg", "respiratory_rate", "skin_temp_nightly", "vo2max", "total_kcal", "hr_day_avg"]) {
  const n = dates.filter((d) => daily(m, d) !== null).length;
  console.log(`  ${m.padEnd(20)} ${n}/${dates.length}`);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}${showValues ? "" : " (Run with --show-values to see your numbers locally.)"}`);
process.exit(failures ? 1 : 0);
