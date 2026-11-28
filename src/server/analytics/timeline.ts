import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { civilDayBounds, offsetMs } from "@/lib/time";
import { allocateIntervals, bucketSamples, bucketZones, hourTicks, TIMELINE_VERSION } from "@/lib/metrics/timeline";
import { chooseHrMax } from "@/lib/metrics/load";
import { getSettings } from "../settings";
import { hrSamples } from "../queries";
import { entriesBetween, listHabits } from "../journal";
import { listWorkouts } from "./workouts";

export const TIMELINE_BUCKET_MS = 60_000;

/**
 * Everything the 24-hour timeline needs for one civil day in the home time zone. The day is [local 00:00, next local
 * 00:00) from civilDayBounds(), so it is 23 h or 25 h long on DST days. Data is sent at one-minute resolution
 * (summaries of the raw samples, which stay unchanged in the database); the chart never interpolates across gaps.
 */
export function timelineView(db: DB, date: string, tz: string) {
  const [d0, d1] = civilDayBounds(date, tz);
  const s = getSettings(db);
  const hm = chooseHrMax({ override: s.hrMaxOverride, age: s.profileAge });
  const samples = hrSamples(db, d0, d1);
  const hr = bucketSamples(samples, d0, d1, TIMELINE_BUCKET_MS);
  const z = bucketZones(samples, d0, d1, TIMELINE_BUCKET_MS, hm?.hrMax ?? null);

  const iv = (dataType: string, variant?: string) => (db.all(sql`
    select start_ms as startMs, end_ms as endMs, value, variant from observations
    where data_type = ${dataType} ${variant !== undefined ? sql`and variant = ${variant}` : sql``} and start_ms < ${d1} and end_ms >= ${d0}`) as { startMs: number; endMs: number; value: number; variant: string }[]);
  const steps = allocateIntervals(iv("steps"), d0, d1, TIMELINE_BUCKET_MS);
  const azmRows = iv("active-zone-minutes");
  const azm = allocateIntervals(azmRows, d0, d1, TIMELINE_BUCKET_MS);
  // Intensity per minute from Google's Active Zone Minutes: 1 fat-burn, 2 cardio, 3 peak. null = no AZM interval.
  const level: Record<string, number> = { FAT_BURN: 1, CARDIO: 2, PEAK: 3 };
  const intensity: (number | null)[] = new Array(hr.length).fill(null);
  for (const r of azmRows) {
    const l = level[r.variant]; if (!l) continue;
    for (let t = Math.max(r.startMs, d0); t < Math.min(Math.max(r.endMs, r.startMs + 1), d1); t += TIMELINE_BUCKET_MS) {
      const i = Math.floor((t - d0) / TIMELINE_BUCKET_MS);
      intensity[i] = Math.max(intensity[i] ?? 0, l);
    }
  }

  const sessions = db.all(sql`select id, start_ms as startMs, end_ms as endMs, is_main as isMain, sleep_type as sleepType from sleep_sessions
    where start_ms < ${d1} and end_ms > ${d0} order by start_ms`) as { id: string; startMs: number; endMs: number; isMain: number | null; sleepType: string | null }[];
  const stages = sessions.length ? (db.all(sql`select session_id as sessionId, start_ms as startMs, end_ms as endMs, stage from sleep_stages
    where is_short_awakening = 0 and session_id in (${sql.join(sessions.map((x) => sql`${x.id}`), sql`, `)}) and start_ms < ${d1} and end_ms > ${d0} order by start_ms`) as { sessionId: string; startMs: number; endMs: number; stage: string }[]) : [];

  const workouts = listWorkouts(db, d0, d1, tz).filter((w) => w.endMs > d0 && w.startMs < d1)
    .map((w) => ({ id: w.id, title: w.title, startMs: w.startMs, endMs: w.endMs, excluded: w.excluded, tooShort: w.tooShort, category: w.label?.category ?? null }));

  const habits = listHabits(db);
  const e = entriesBetween(db, date, date);
  const journal = habits.flatMap((h) => { const v = e.get(h.id)?.get(date); return v === undefined ? [] : [{ id: h.id, name: h.name, kind: h.kind, unit: h.unit, value: v }]; });

  return {
    version: TIMELINE_VERSION, date, tz, fromMs: d0, toMs: d1, bucketMs: TIMELINE_BUCKET_MS, hoursInDay: (d1 - d0) / 3_600_000,
    hrMax: hm?.hrMax ?? null, hrMaxSource: hm?.source ?? null,
    ticks: hourTicks(d0, d1, (t) => offsetMs(t, tz)),
    hr: hr.map((b) => (b.mean === null ? null : [Math.round(b.mean * 10) / 10, b.min!, b.max!, b.n] as [number, number, number, number])),
    covered: z.covered.map((c) => Math.round(c)), zones: z.zones?.map((r) => r.map((x) => Math.round(x))) ?? null,
    steps: steps.map((v) => (v === null ? null : Math.round(v * 100) / 100)), azm, intensity,
    sleep: sessions.map((x) => ({ id: x.id, startMs: x.startMs, endMs: x.endMs, main: x.isMain !== 0, stages: stages.filter((st) => st.sessionId === x.id).map(({ startMs, endMs, stage }) => ({ startMs, endMs, stage })) })),
    workouts, journal, rawSamples: samples.length,
  };
}
export type TimelineData = ReturnType<typeof timelineView>;
