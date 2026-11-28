import type { DB } from "../db/client";
import { METRIC_BY_ID, type MetricDef } from "./registry";
import { dailyAttrSeries, dailyMetricSeries, dateRange, nightSampleSeries, derivedSeries, intervalSumSeries, localToday, nightSeries, sampleDailySeries, shiftDate, type DaySeries } from "./series";
import { computeScores, nightValue, type DayScores } from "./scores";
import { personalRange } from "@/lib/metrics/personal-range";

/**
 * Daily values for any registered metric over [from, to]. Missing days are absent (never 0).
 * `scores` can be passed in to avoid recomputation when several score metrics are needed.
 */
export function metricSeries(db: DB, def: MetricDef, from: string, to: string, fbOffsetS: number, scores?: Map<string, DayScores>): DaySeries {
  const s = def.series;
  switch (s.kind) {
    case "daily": return dailyMetricSeries(db, s.metric, from, to);
    case "interval": {
      const m = intervalSumSeries(db, s.dataType, from, to, fbOffsetS, s.variant);
      return s.scale ? new Map([...m].map(([d, v]) => [d, v * s.scale!])) : m;
    }
    case "sample": return sampleDailySeries(db, s.dataType, from, to, fbOffsetS, s.agg);
    case "dailyAttr": return dailyAttrSeries(db, s.metric, s.attr, from, to);
    case "nightSample": return nightSampleSeries(db, s.dataType, from, to, fbOffsetS, s.agg, s.attr);
    case "derived": {
      const m = derivedSeries(db, s.metric, from, to);
      return s.scale ? new Map([...m].map(([d, v]) => [d, v * s.scale!])) : m;
    }
    case "night": {
      const { nights } = nightSeries(db, from, to, fbOffsetS);
      const out: DaySeries = new Map();
      for (const [d, n] of nights) { const v = nightValue(n, s.field); if (v !== null) out.set(d, v); }
      return out;
    }
    case "score": {
      const sc = scores ?? computeScores(db, from, to, fbOffsetS);
      const out: DaySeries = new Map();
      for (const [d, x] of sc) {
        const v = s.field === "recovery" ? (x.recovery.status === "ok" ? x.recovery.score : null)
          : s.field === "sleepScore" ? x.sleepScore?.score ?? null
          : s.field === "sleepDebt" ? (x.sleepDebtMin !== null && x.sleepDebtNights >= 3 ? x.sleepDebtMin / 60 : null)
          : s.field === "strain" ? x.strain
          : s.field === "acwr" ? x.acwr.ratio
          : x.acwr.balance;
        if (v !== null && Number.isFinite(v)) out.set(d, v);
      }
      return out;
    }
  }
}

export type MetricBaseline = { status: "ok"; mean: number; sd: number; n: number } | { status: "calibrating"; have: number; need: number };
export type RangeKey = "7d" | "30d" | "90d" | "1y";
export const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/**
 * Daily totals ("sum" metrics: steps, energy, minutes, load) are incomplete for the current day. They are shown as
 * "so far" but left out of averages, min/max, comparisons and baselines, which would otherwise be pulled down.
 */
export const isCompleteDay = (def: MetricDef, date: string, today: string) => def.agg !== "sum" || date < today;

/** Aggregate of the complete days that have data within [from, to] — never fills gaps with 0. */
function aggregate(def: MetricDef, series: DaySeries, from: string, to: string, today: string) {
  const vals = dateRange(from, to).filter((d) => isCompleteDay(def, d, today)).map((d) => series.get(d)).filter((v): v is number => v !== undefined);
  if (!vals.length) return { value: null as number | null, days: 0, min: null as number | null, max: null as number | null };
  // For "sum" metrics a period value is the mean DAILY total (comparable across periods with different coverage).
  return { value: mean(vals), days: vals.length, min: Math.min(...vals), max: Math.max(...vals) };
}

/**
 * Everything a metric detail page needs: series for the range, latest value, 7/30/90-day daily averages,
 * min/max, 28-day personal baseline (mean ± SD), and comparison with the previous period of equal length.
 */
export function metricDetail(db: DB, id: string, range: RangeKey, end: string, fbOffsetS: number) {
  const def = METRIC_BY_ID.get(id);
  if (!def) return null;
  const days = RANGE_DAYS[range];
  const from = shiftDate(end, -days + 1);
  const prevFrom = shiftDate(from, -days), prevTo = shiftDate(from, -1);
  const histFrom = shiftDate(end, -Math.max(days * 2, 120));
  const scores = def.series.kind === "score" ? computeScores(db, histFrom, end, fbOffsetS) : undefined;
  const all = metricSeries(db, def, histFrom, end, fbOffsetS, scores);
  const today = localToday(fbOffsetS);
  const points = dateRange(from, end).map((date) => ({ date, value: all.get(date) ?? null, partial: !isCompleteDay(def, date, today) }));
  const latestDate = [...all.keys()].filter((d) => d <= end).sort().at(-1) ?? null;
  const cur = aggregate(def, all, from, end, today), prev = aggregate(def, all, prevFrom, prevTo, today);
  const baseVals = dateRange(shiftDate(end, -28), shiftDate(end, -1)).filter((d) => isCompleteDay(def, d, today)).map((d) => all.get(d)).filter((v): v is number => v !== undefined);
  const bMean = mean(baseVals);
  const baseline: MetricBaseline | null = def.baseline && baseVals.length >= 14 && bMean !== null
    ? { status: "ok", mean: bMean, sd: Math.sqrt(baseVals.reduce((a, v) => a + (v - bMean) ** 2, 0) / (baseVals.length - 1)), n: baseVals.length }
    : def.baseline ? { status: "calibrating", have: baseVals.length, need: 14 } : null;
  return {
    def, range, from, to: end, points,
    latest: latestDate ? { date: latestDate, value: all.get(latestDate)!, partial: !isCompleteDay(def, latestDate, today) } : null,
    averages: (["7d", "30d", "90d"] as RangeKey[]).map((r) => ({ range: r, ...aggregate(def, all, shiftDate(end, -RANGE_DAYS[r] + 1), end, today) })),
    period: cur, previous: prev,
    change: cur.value !== null && prev.value !== null && prev.value !== 0 ? { abs: cur.value - prev.value, pct: ((cur.value - prev.value) / Math.abs(prev.value)) * 100 } : null,
    baseline,
    /** Personal normal range (personal-range@1, log scale for HRV) over the same 28 days; drawn as the chart band. */
    normalRange: def.baseline ? personalRange(baseVals, def.logScale ? "log" : "linear") : null,
    totalDays: all.size,
  };
}
