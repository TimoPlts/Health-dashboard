import type { DB } from "../db/client";
import { completeness, deviation, personalRange, RANGE_WINDOW_DAYS, type Deviation, type PersonalRange, type RangeScale } from "@/lib/metrics/personal-range";
import { METRIC_BY_ID, type MetricDef } from "./registry";
import { metricSeries } from "./values";
import { dateRange, shiftDate } from "./series";

/**
 * Health monitor read model: for each overnight / resting measurement, the latest value, your personal normal range
 * (28 days before that value, personal-range@1), the deviation, a 90-day trend, data completeness and calibration.
 * Provider values are shown unchanged; Baseline only adds the comparison with your own history.
 */
export interface MonitorSpec { id: string; scale: RangeScale; range: boolean; note?: string }

export const MONITOR: MonitorSpec[] = [
  { id: "resting_hr", scale: "linear", range: true },
  { id: "hrv", scale: "log", range: true, note: "HRV is right-skewed, so the range is computed on ln(RMSSD) and converted back: it is wider above the typical value than below." },
  { id: "sleeping_hr", scale: "linear", range: true },
  { id: "respiratory_rate", scale: "linear", range: true },
  { id: "spo2", scale: "linear", range: true },
  { id: "skin_temp", scale: "linear", range: true, note: "Google already reports this relative to Fitbit's own baseline; the range here describes how much it usually varies for you." },
  { id: "hrv_deep", scale: "log", range: true },
  { id: "spo2_low", scale: "linear", range: true },
  { id: "resp_deep", scale: "linear", range: true },
  { id: "skin_temp_abs", scale: "linear", range: true },
  { id: "hr_avg", scale: "linear", range: true },
  { id: "vo2max", scale: "linear", range: false, note: "Fitbit updates this estimate rarely, so no daily range is computed." },
];

export const MONITOR_METHOD =
  "personal-range@1 — your normal range is the mean ± 1 standard deviation of the 28 days before the latest value (at least 14 days with data). " +
  "The deviation is how many standard deviations the latest value is from that mean. Roughly two in three days fall inside the range, so a single day outside it is common. " +
  "This describes your own data only. It is not a medical reference range, a diagnosis or a risk score.";

export interface MonitorItem {
  spec: MonitorSpec; def: MetricDef;
  latest: { date: string; value: number; daysAgo: number } | null;
  range: PersonalRange | null; deviation: Deviation | null;
  completeness: { have: number; of: number; share: number };
  points: { date: string; value: number | null }[];
  days90: number;
}

function itemFor(db: DB, spec: MonitorSpec, end: string, fb: number): MonitorItem {
  const def = METRIC_BY_ID.get(spec.id)!;
  const from = shiftDate(end, -119);
  const s = metricSeries(db, def, from, end, fb);
  const dates = dateRange(from, end);
  const latestDate = [...s.keys()].filter((d) => d <= end).sort().at(-1) ?? null;
  let range: PersonalRange | null = null, dev: Deviation | null = null;
  if (latestDate && spec.range) {
    const prev = dateRange(shiftDate(latestDate, -RANGE_WINDOW_DAYS), shiftDate(latestDate, -1)).map((d) => s.get(d) ?? null);
    range = personalRange(prev, spec.scale);
    if (range.status === "ok") dev = deviation(s.get(latestDate)!, range);
  } else if (spec.range) {
    range = { status: "calibrating", version: "personal-range@1", have: 0, need: 14 };
  }
  const last90 = dates.slice(-90);
  return {
    spec, def,
    latest: latestDate ? { date: latestDate, value: s.get(latestDate)!, daysAgo: Math.round((Date.parse(end) - Date.parse(latestDate)) / 86_400_000) } : null,
    range, deviation: dev,
    completeness: completeness(dates.map((d) => s.get(d) ?? null), RANGE_WINDOW_DAYS),
    points: last90.map((date) => ({ date, value: s.get(date) ?? null })),
    days90: last90.filter((d) => s.has(d)).length,
  };
}

export function monitorView(db: DB, end: string, fb: number) {
  return MONITOR.map((spec) => itemFor(db, spec, end, fb));
}
