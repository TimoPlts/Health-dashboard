import type { DataSourceFamily } from "./client";
import { unionField } from "./normalize";

/**
 * Sync stream definitions for the Google Health API.
 *
 * Method choice:
 *  - Sample-level vitals (heart rate, HRV, SpO2) use `list` restricted to google-wearables so device provenance is kept.
 *  - Interval activity data (steps, distance, energy, AZM…) uses `reconcile`, which merges sources into one stream and
 *    excludes off-wrist intervals — preventing phone + wearable double counting. Reconciled points carry no dataSource,
 *    so their provenance is recorded as platform "RECONCILED".
 *  - Sleep uses `reconcile` (list does not support dataSourceFamily for sleep).
 *
 * `lookbackDays`: on every incremental sync the window is re-fetched this far back, because the Fitbit Air only
 * uploads when the Google Health phone app syncs and sleep sessions are re-processed after the fact. Upserts are
 * idempotent, so re-fetching is safe.
 */
export type FilterKind = "sample" | "interval" | "daily" | "sleep";

export interface GoogleStream {
  dataType: string;
  method: "list" | "reconcile";
  filter: FilterKind;
  chunkDays: number;
  pageSize: number;
  lookbackDays: number;
  family?: DataSourceFamily;
  /** Session-type streams: rows inside a re-fetched window that are no longer returned get deleted. */
  replaceWindow?: boolean;
}

export const GOOGLE_STREAMS: GoogleStream[] = [
  { dataType: "heart-rate", method: "list", filter: "sample", chunkDays: 1, pageSize: 10000, lookbackDays: 2, family: "google-wearables" },
  { dataType: "heart-rate-variability", method: "list", filter: "sample", chunkDays: 7, pageSize: 10000, lookbackDays: 3, family: "google-wearables" },
  { dataType: "oxygen-saturation", method: "list", filter: "sample", chunkDays: 7, pageSize: 10000, lookbackDays: 3, family: "google-wearables" },
  { dataType: "respiratory-rate-sleep-summary", method: "list", filter: "sample", chunkDays: 30, pageSize: 1000, lookbackDays: 7 },
  { dataType: "sleep", method: "reconcile", filter: "sleep", chunkDays: 14, pageSize: 25, lookbackDays: 7, replaceWindow: true },
  { dataType: "exercise", method: "list", filter: "interval", chunkDays: 14, pageSize: 25, lookbackDays: 7, replaceWindow: true },
  { dataType: "steps", method: "reconcile", filter: "interval", chunkDays: 3, pageSize: 10000, lookbackDays: 2 },
  { dataType: "distance", method: "reconcile", filter: "interval", chunkDays: 3, pageSize: 10000, lookbackDays: 2 },
  { dataType: "active-energy-burned", method: "reconcile", filter: "interval", chunkDays: 3, pageSize: 10000, lookbackDays: 2 },
  { dataType: "basal-energy-burned", method: "reconcile", filter: "interval", chunkDays: 3, pageSize: 10000, lookbackDays: 2 },
  { dataType: "active-zone-minutes", method: "reconcile", filter: "interval", chunkDays: 7, pageSize: 10000, lookbackDays: 2 },
  { dataType: "active-minutes", method: "reconcile", filter: "interval", chunkDays: 7, pageSize: 10000, lookbackDays: 2 },
  { dataType: "time-in-heart-rate-zone", method: "reconcile", filter: "interval", chunkDays: 7, pageSize: 10000, lookbackDays: 2 },
  { dataType: "sedentary-period", method: "reconcile", filter: "interval", chunkDays: 7, pageSize: 10000, lookbackDays: 2 },
  { dataType: "daily-resting-heart-rate", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "daily-heart-rate-variability", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "daily-oxygen-saturation", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "daily-respiratory-rate", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "daily-sleep-temperature-derivations", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "daily-vo2-max", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "daily-heart-rate-zones", method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 },
  { dataType: "weight", method: "list", filter: "sample", chunkDays: 90, pageSize: 1000, lookbackDays: 14 },
  { dataType: "body-fat", method: "list", filter: "sample", chunkDays: 90, pageSize: 1000, lookbackDays: 14 },
  { dataType: "vo2-max", method: "list", filter: "sample", chunkDays: 90, pageSize: 1000, lookbackDays: 14 },
];

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * AIP-160 filter for a closed-open window [startMs, endMs).
 * Patterns from the list method reference: `<field>.interval.start_time`, `<field>.sample_time.physical_time`,
 * `<field>.date`, `sleep.interval.end_time`.
 * Daily types are filtered on the civil date of the UTC window bounds; the lookback makes boundary days safe.
 */
export function buildFilter(stream: Pick<GoogleStream, "dataType" | "filter">, startMs: number, endMs: number): string {
  const f = unionField(stream.dataType);
  switch (stream.filter) {
    case "sample":
      return `${f}.sample_time.physical_time >= "${iso(startMs)}" AND ${f}.sample_time.physical_time < "${iso(endMs)}"`;
    case "interval":
      return `${f}.interval.start_time >= "${iso(startMs)}" AND ${f}.interval.start_time < "${iso(endMs)}"`;
    case "sleep":
      return `sleep.interval.end_time >= "${iso(startMs)}" AND sleep.interval.end_time < "${iso(endMs)}"`;
    case "daily":
      return `${f}.date >= "${isoDate(startMs)}" AND ${f}.date < "${isoDate(endMs)}"`;
  }
}

/** Split [fromMs, toMs) into chunks of `chunkDays`, oldest first. */
export function chunkWindows(fromMs: number, toMs: number, chunkDays: number): [number, number][] {
  const step = chunkDays * 86_400_000;
  const out: [number, number][] = [];
  for (let s = fromMs; s < toMs; s += step) out.push([s, Math.min(s + step, toMs)]);
  return out;
}
