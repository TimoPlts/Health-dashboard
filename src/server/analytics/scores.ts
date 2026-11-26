import type { DB } from "../db/client";
import { acwr as acwrFn } from "@/lib/metrics/load";
import { fatigueFlags, hrvBaseline, recoveryIndex, rhrBaseline, trainingReadiness, type BaselineResult, type FatigueFlag, type RecoveryResult } from "@/lib/metrics/recovery";
import { sleepDebt, sleepScore, sleepRegularityIndex, midpointVariability } from "@/lib/metrics/sleep";
import { sleepEfficiency } from "@/lib/metrics/sleep-baseline";
import { getSettings } from "../settings";
import { dailyMetricSeries, dateRange, derivedSeries, nightSeries, shiftDate, type NightRow } from "./series";

/** History loaded before `from` so baselines (28 d), ACWR (28 d) and debt (7 d) are available on the first day. */
const HISTORY_DAYS = 42;

export interface DayScores {
  date: string;
  recovery: RecoveryResult;
  readiness: ReturnType<typeof trainingReadiness>;
  sleepScore: ReturnType<typeof sleepScore>;
  sleepDebtMin: number | null;
  sleepDebtNights: number;
  strain: number | null;
  acwr: ReturnType<typeof acwrFn>;
  flags: FatigueFlag[];
  hrvBase: BaselineResult;
  rhrBase: BaselineResult;
  night: NightRow | null;
}

export function nightValue(n: NightRow | undefined | null, field: string): number | null {
  if (!n) return null;
  const asleep = n.minutesAsleep;
  const local = (ms: number, off: number | null) => (((ms + (off ?? 0) * 1000) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000;
  switch (field) {
    case "asleep": return asleep === null ? null : asleep / 60;
    case "inBed": return n.timeInBedMin / 60;
    case "efficiency": return sleepEfficiency(asleep, n.timeInBedMin);
    case "deep": return n.stages.DEEP !== undefined ? n.stages.DEEP / 60 : null;
    case "rem": return n.stages.REM !== undefined ? n.stages.REM / 60 : null;
    case "light": return n.stages.LIGHT !== undefined ? n.stages.LIGHT / 60 : null;
    case "awake": return n.stages.AWAKE ?? n.minutesAwake;
    case "latency": return n.minutesToFallAsleep;
    case "bedtime": return (local(n.startMs, n.startOffsetS) - 720 + 1440) % 1440; // minutes after noon
    case "wake": return local(n.endMs, n.endOffsetS);
    default: return null;
  }
}

/** Compute Baseline's day-level scores for every date in [from, to]. Pure over stored data; nothing is persisted. */
export function computeScores(db: DB, from: string, to: string, fbOffsetS: number): Map<string, DayScores> {
  const settings = getSettings(db);
  const need = settings.sleepNeedMin;
  const hFrom = shiftDate(from, -HISTORY_DAYS);
  const dates = dateRange(hFrom, to);
  const hrv = dailyMetricSeries(db, "hrv_rmssd_daily", hFrom, to);
  const rhr = dailyMetricSeries(db, "resting_hr", hFrom, to);
  const resp = dailyMetricSeries(db, "respiratory_rate", hFrom, to);
  const skin = dailyMetricSeries(db, "skin_temp_deviation", hFrom, to);
  const load = derivedSeries(db, "load_trimp", hFrom, to);
  const { nights } = nightSeries(db, hFrom, to, fbOffsetS);
  const val = (m: Map<string, number>, d: string) => m.get(d) ?? null;

  const out = new Map<string, DayScores>();
  dates.forEach((date, i) => {
    if (date < from) return;
    const prev = dates.slice(Math.max(0, i - 28), i);
    const hb = hrvBaseline(prev.map((d) => val(hrv, d)));
    const rb = rhrBaseline(prev.map((d) => val(rhr, d)));
    const respB = rhrBaseline(prev.map((d) => val(resp, d)));
    const night = nights.get(date) ?? null;
    const asleepPerNight = dates.slice(Math.max(0, i - 6), i + 1).map((d) => nights.get(d)?.minutesAsleep ?? null);
    const debt = sleepDebt(asleepPerNight, need, 7);
    const loads = dates.slice(0, i + 1).map((d) => val(load, d));
    const a = acwrFn(loads);
    const rec = recoveryIndex({ hrvToday: val(hrv, date), hrvBaseline: hb, rhrToday: val(rhr, date), rhrBaseline: rb, minutesAsleep: night?.minutesAsleep ?? null, sleepNeedMin: need });
    const ready = trainingReadiness({ hrvLast7: dates.slice(Math.max(0, i - 6), i + 1).map((d) => val(hrv, d)), hrvBaseline: hb, rhrToday: val(rhr, date), rhrBaseline: rb, acwr: a.ratio });
    const ss = night ? sleepScore({
      minutesAsleep: night.minutesAsleep, efficiencyPct: sleepEfficiency(night.minutesAsleep, night.timeInBedMin),
      deepMin: night.sleepType === "STAGES" ? night.stages.DEEP ?? 0 : null, remMin: night.sleepType === "STAGES" ? night.stages.REM ?? 0 : null, needMin: need,
    }) : null;
    out.set(date, {
      date, recovery: rec, readiness: ready, sleepScore: ss, sleepDebtMin: debt?.debtMin ?? null, sleepDebtNights: debt?.tracked ?? 0,
      strain: val(load, date), acwr: a,
      flags: fatigueFlags({
        hrvState: ready.status === "ok" ? ready.hrvState : null, rhrToday: val(rhr, date), rhrBaseline: rb, acwr: a.ratio,
        sleepDebtMin: debt && debt.tracked >= 5 ? debt.debtMin : null, skinTempDeviation: val(skin, date), respToday: val(resp, date), respBaseline: respB,
      }),
      hrvBase: hb, rhrBase: rb, night,
    });
  });
  return out;
}

/** Sleep regularity over the 14 nights up to `to`: SRI (Phillips 2017) and midpoint variability. */
export function sleepConsistency(db: DB, to: string, fbOffsetS: number, nightsBack = 14) {
  const from = shiftDate(to, -nightsBack + 1);
  const { nights } = nightSeries(db, from, to, fbOffsetS);
  const list = [...nights.values()];
  if (list.length < 5) return { status: "calibrating" as const, have: list.length, need: 5 };
  const stageRows = db.$client.prepare(
    `select start_ms as startMs, end_ms as endMs from sleep_stages where is_short_awakening = 0 and stage != 'AWAKE' and session_id in (${list.map(() => "?").join(",")})`,
  ).all(...list.map((n) => n.id)) as { startMs: number; endMs: number }[];
  const dayStarts = list.map((n) => Date.parse(`${n.date}T00:00:00Z`) - (n.endOffsetS ?? fbOffsetS) * 1000);
  return {
    status: "ok" as const,
    sri: sleepRegularityIndex(stageRows, dayStarts),
    midpoint: midpointVariability(list.map((n) => (n.startMs + n.endMs) / 2), list.map((n) => n.endOffsetS)),
    nights: list.length,
  };
}
