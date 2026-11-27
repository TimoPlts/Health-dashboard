import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { hrSamples } from "../queries";
import { getSettings } from "../settings";
import { downsample } from "@/lib/metrics/periods";
import { medianMinutes, recommendedBedtime, wakeAfterSleepOnset } from "@/lib/metrics/sleep-detail";
import { sleepEfficiency } from "@/lib/metrics/sleep-baseline";
import { nightSeries, shiftDate, type NightRow } from "./series";
import { computeScores, nightValue } from "./scores";

type StageRow = { sessionId: string; startMs: number; endMs: number; stage: string; isShortAwakening: number };

function stagesFor(db: DB, ids: string[]): Map<string, StageRow[]> {
  const out = new Map<string, StageRow[]>();
  if (!ids.length) return out;
  const rows = db.all(sql`select session_id as sessionId, start_ms as startMs, end_ms as endMs, stage, is_short_awakening as isShortAwakening
    from sleep_stages where session_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by start_ms`) as StageRow[];
  for (const r of rows) out.set(r.sessionId, [...(out.get(r.sessionId) ?? []), r]);
  return out;
}
const waso = (rows: StageRow[] | undefined) => (rows ? wakeAfterSleepOnset(rows.map((r) => ({ ...r, isShortAwakening: Boolean(r.isShortAwakening) }))) : null);

/** Samples of an observation type inside [startMs, endMs] as {tMs, bpm(value)} for the shared time-series chart. */
function obsSamples(db: DB, dataType: string, startMs: number, endMs: number) {
  return (db.all(sql`select start_ms as tMs, value as bpm from observations where data_type = ${dataType} and start_ms >= ${startMs} and start_ms <= ${endMs} order by start_ms`) as { tMs: number; bpm: number }[]);
}

export interface NightSummary {
  date: string; asleepMin: number | null; efficiencyPct: number | null; deepMin: number | null; remMin: number | null;
  wasoMin: number | null; interruptions: number | null; latencyMin: number | null; bedtime: number | null; wake: number | null; score: number | null;
}

/**
 * Everything the Sleep page needs beyond the existing sleepView: overnight series, wake after sleep onset, naps,
 * sleep-debt history, the recommended bedtime and a night-by-night comparison. Pure reads; nothing is stored.
 */
export function sleepDetail(db: DB, date: string, fbOffsetS: number, wakeTargetMin: number | null) {
  const s = getSettings(db);
  const from = shiftDate(date, -29);
  const { nights, naps } = nightSeries(db, from, date, fbOffsetS);
  const stageMap = stagesFor(db, [...nights.values()].map((n) => n.id));
  const scores = computeScores(db, from, date, fbOffsetS);
  const summary = (n: NightRow): NightSummary => {
    const w = waso(stageMap.get(n.id));
    const stages = n.sleepType === "STAGES";
    return {
      date: n.date, asleepMin: n.minutesAsleep, efficiencyPct: sleepEfficiency(n.minutesAsleep, n.timeInBedMin),
      deepMin: stages ? n.stages.DEEP ?? 0 : null, remMin: stages ? n.stages.REM ?? 0 : null,
      wasoMin: w?.wasoMin ?? null, interruptions: w?.interruptions ?? null, latencyMin: n.minutesToFallAsleep,
      bedtime: nightValue(n, "bedtime"), wake: nightValue(n, "wake"), score: scores.get(n.date)?.sleepScore?.score ?? null,
    };
  };
  const night = nights.get(date) ?? null;
  const prev = nights.get(shiftDate(date, -1)) ?? null;
  const last14 = [...nights.values()].filter((n) => n.date > shiftDate(date, -14) && n.date <= date).map(summary);
  const avg = (k: keyof Omit<NightSummary, "date">) => {
    const v = last14.map((x) => x[k]).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const average: NightSummary & { nights: number } = {
    date: "avg", nights: last14.length, asleepMin: avg("asleepMin"), efficiencyPct: avg("efficiencyPct"), deepMin: avg("deepMin"), remMin: avg("remMin"),
    wasoMin: avg("wasoMin"), interruptions: avg("interruptions"), latencyMin: avg("latencyMin"), bedtime: avg("bedtime"), wake: avg("wake"), score: avg("score"),
  };

  // Overnight series (HR downsampled to 1-minute means for drawing; HRV and SpO₂ as recorded).
  const overnight = night ? {
    startMs: night.startMs, endMs: night.endMs,
    hr: downsample(hrSamples(db, night.startMs, night.endMs), 60_000),
    hrv: obsSamples(db, "heart-rate-variability", night.startMs, night.endMs),
    spo2: obsSamples(db, "oxygen-saturation", night.startMs, night.endMs),
  } : null;

  // Recommended bedtime: wake target (setting) or your usual wake time (median of 14 nights, ≥ 5).
  const usualWake = medianMinutes(last14.map((n) => n.wake));
  const wakeMin = wakeTargetMin ?? usualWake;
  const bedtime = wakeMin !== null ? recommendedBedtime({ wakeMin, needMin: s.goals.sleepMin ?? s.sleepNeedMin, efficienciesPct: last14.map((n) => n.efficiencyPct) }) : null;

  return {
    night: night ? summary(night) : null,
    previous: prev ? summary(prev) : null,
    average,
    interruptions: night ? waso(stageMap.get(night.id)) : null,
    overnight,
    naps: naps.filter((n) => n.date === date).map((n) => ({ startMs: n.startMs, endMs: n.endMs, asleepMin: n.minutesAsleep })),
    debtHistory: [...scores.entries()].map(([d, x]) => ({ date: d, value: x.sleepDebtMin !== null && x.sleepDebtNights >= 3 ? x.sleepDebtMin / 60 : null })),
    bedtime: bedtime ? { ...bedtime, wakeMin: wakeMin!, wakeSource: wakeTargetMin !== null ? ("target" as const) : ("usual" as const), needMin: s.goals.sleepMin ?? s.sleepNeedMin } : null,
    usualWakeNightsNeeded: usualWake === null ? Math.max(0, 5 - last14.filter((n) => n.wake !== null).length) : 0,
  };
}
