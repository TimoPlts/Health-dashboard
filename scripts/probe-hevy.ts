/**
 * Phase-1 real-data probe for Hevy. Prints structure and counts only (no workout contents).
 *   npm run probe:hevy
 */
import "./_env";
import { mkdirSync, writeFileSync } from "node:fs";
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";
import { getHevyApiKey } from "../src/server/connections";
import { HevyClient, type HevyEvent } from "../src/server/providers/hevy/client";

const db = openDatabase(env().DATABASE_PATH);
let key: string | undefined;
try { key = getHevyApiKey(db); } catch { key = env().HEVY_API_KEY; }
if (!key) { console.error("No Hevy API key (connect in Settings or set HEVY_API_KEY)."); process.exit(1); }
const c = new HevyClient(key);
const report: Record<string, unknown> = { generatedAt: new Date().toISOString() };

const info = await c.userInfo();
report.user = { isPro: info.is_pro ?? null, weightUnit: info.weight_unit ?? null };
console.log(`user OK · pro=${info.is_pro} · unit=${info.weight_unit}`);

report.workoutCount = await c.workoutCount();
console.log(`workouts: ${report.workoutCount}`);

const first = (await c.workouts().next()).value;
const w = first?.items[0];
if (w) {
  report.workoutFields = Object.keys(w);
  report.setFields = Object.keys(w.exercises[0]?.sets[0] ?? {});
  report.oldestPageCount = first?.pageCount;
  report.timestampFormat = { start: w.start_time.replace(/\d/g, "9"), end: w.end_time.replace(/\d/g, "9") };
  console.log(`workout fields: ${Object.keys(w).join(", ")}`);
  console.log(`timestamp format: ${(report.timestampFormat as { start: string }).start}`);
}
const ev = (await c.workoutEvents(new Date(Date.now() - 30 * 86_400_000).toISOString()).next()).value;
report.eventsLast30d = { pages: ev?.pageCount, firstPageEvents: ev?.items.length, types: [...new Set((ev?.items ?? []).map((e: HevyEvent) => e.type))] };
console.log(`events (30 d): ${JSON.stringify(report.eventsLast30d)}`);

const tpl = (await c.exerciseTemplates().next()).value;
report.templates = { pages: tpl?.pageCount, fields: Object.keys(tpl?.items[0] ?? {}) };
console.log(`templates: ${tpl?.pageCount} pages`);

mkdirSync("probe-output", { recursive: true });
writeFileSync(`probe-output/hevy-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(report, null, 2));
