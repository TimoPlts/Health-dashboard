import { civilDate } from "../../../lib/time";
import type { DataSourceFamily } from "./client";

/**
 * Sync stream definitions for the Google Health API v4.
 * Verified against a real Fitbit Air account on 2026-11-26 (see docs/API_RESEARCH.md § "Verified against real data").
 *
 * Method choice:
 *  - Sample-level vitals (heart rate, HRV, SpO2) use `list` restricted to google-wearables so device provenance is kept.
 *  - Interval activity data (steps, distance, energy, AZM…) uses `reconcile`. The raw `list` contains BOTH the Fitbit Air
 *    and the iPhone (Apple Health) — summing it overstated daily steps by up to 56 % and active energy by up to 100 % in
 *    the real-data check. Reconciled intervals never overlapped and their per-day sum matched `dailyRollUp` exactly.
 *    Reconciled points carry no dataSource; provenance is recorded as platform "RECONCILED".
 *  - Sleep uses `reconcile` (list rejects dataSourceFamily for sleep; reconcile merges sources).
 *  - Exercise uses `list` (all sources) so provenance is kept: Fitbit-detected sessions are distinguishable from
 *    sessions that Hevy writes to Apple Health, which Google then imports.
 *  - `total-calories` and `calories-in-heart-rate-zone` only support rollups → `dailyRollUp` (also used for the
 *    provider's daily heart-rate min/avg/max, which is what the Google Health app shows).
 *
 * `lookbackDays`: on every incremental sync the window is re-fetched this far back, because the Fitbit Air only
 * uploads when the Google Health phone app syncs and sleep sessions are re-processed after the fact. Upserts are
 * idempotent, so re-fetching is safe.
 */
export type FilterKind = "sample" | "interval" | "daily" | "sleep" | "exercise" | "rollup";

export interface GoogleStream {
  dataType: string;
  method: "list" | "reconcile" | "dailyRollUp";
  filter: FilterKind;
  chunkDays: number;
  pageSize: number;
  lookbackDays: number;
  family?: DataSourceFamily;
  /** Session-type streams: rows inside a re-fetched window that are no longer returned get deleted. */
  replaceWindow?: boolean;
}

const sample = (dataType: string, o: Partial<GoogleStream> = {}): GoogleStream =>
  ({ dataType, method: "list", filter: "sample", chunkDays: 90, pageSize: 10000, lookbackDays: 14, ...o });
const interval = (dataType: string, o: Partial<GoogleStream> = {}): GoogleStream =>
  ({ dataType, method: "reconcile", filter: "interval", chunkDays: 7, pageSize: 10000, lookbackDays: 2, ...o });
const daily = (dataType: string): GoogleStream =>
  ({ dataType, method: "list", filter: "daily", chunkDays: 90, pageSize: 1000, lookbackDays: 7 });
const rollup = (dataType: string): GoogleStream =>
  // Range limit is 14 days for total-calories / calories-in-heart-rate-zone / heart-rate; pageSize max 14.
  ({ dataType, method: "dailyRollUp", filter: "rollup", chunkDays: 14, pageSize: 14, lookbackDays: 3 });

export const GOOGLE_STREAMS: GoogleStream[] = [
  // Vitals (samples)
  sample("heart-rate", { chunkDays: 1, lookbackDays: 2, family: "google-wearables" }),
  sample("heart-rate-variability", { chunkDays: 7, lookbackDays: 3, family: "google-wearables" }),
  sample("oxygen-saturation", { chunkDays: 7, lookbackDays: 3, family: "google-wearables" }),
  sample("respiratory-rate-sleep-summary", { chunkDays: 30, pageSize: 1000, lookbackDays: 7 }),
  // Sessions
  { dataType: "sleep", method: "reconcile", filter: "sleep", chunkDays: 14, pageSize: 25, lookbackDays: 7, replaceWindow: true },
  { dataType: "exercise", method: "list", filter: "exercise", chunkDays: 14, pageSize: 25, lookbackDays: 7, replaceWindow: true },
  // Activity (intervals, reconciled across sources)
  interval("steps", { chunkDays: 3 }),
  interval("distance", { chunkDays: 3 }),
  interval("active-energy-burned", { chunkDays: 3 }),
  interval("basal-energy-burned", { chunkDays: 3 }),
  interval("active-zone-minutes"),
  interval("active-minutes"),
  interval("time-in-heart-rate-zone", { chunkDays: 3 }),
  interval("activity-level", { chunkDays: 3 }),
  interval("sedentary-period"),
  interval("floors"),
  interval("altitude"),
  interval("swim-lengths-data"),
  // Provider daily summaries
  daily("daily-resting-heart-rate"),
  daily("daily-heart-rate-variability"),
  daily("daily-oxygen-saturation"),
  daily("daily-respiratory-rate"),
  daily("daily-sleep-temperature-derivations"),
  daily("daily-vo2-max"),
  daily("daily-heart-rate-zones"),
  // Rollup-only daily totals
  rollup("total-calories"),
  rollup("calories-in-heart-rate-zone"),
  rollup("heart-rate"),
  // Body & fitness measurements (sparse)
  sample("weight"),
  sample("body-fat"),
  sample("height", { chunkDays: 365, lookbackDays: 30 }),
  sample("vo2-max"),
  sample("run-vo2-max"),
  sample("blood-glucose"),
  sample("core-body-temperature"),
];

/** Stable id for a stream in sync_state (rollups share a dataType with list streams, e.g. heart-rate). */
export const streamId = (s: Pick<GoogleStream, "dataType" | "method">) => (s.method === "dailyRollUp" ? `${s.dataType}:daily-rollup` : s.dataType);

/**
 * Name of a data type inside filter expressions: snake_case ("heart-rate" → "heart_rate").
 * Endpoint paths use kebab-case; filters reject hyphens (developers.google.com/health/filters).
 */
export const filterName = (dataType: string) => dataType.replace(/-/g, "_");

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * AIP-160 filter for a closed-open window [startMs, endMs). Only `>=` and `<` joined by AND are supported.
 * Filterable fields per record type (developers.google.com/health/filters, verified against real data):
 *   sample   → <type>.sample_time.physical_time     interval → <type>.interval.start_time
 *   daily    → <type>.date ("YYYY-MM-DD")             sleep    → sleep.interval.end_time
 *   exercise → exercise.interval.civil_start_time ONLY (civil, no offset). Civil bounds are the window's dates in
 *              `timeZone`; see exerciseCivilWindow for the matching replace window.
 * Daily types are filtered on the civil date of the UTC window bounds; the lookback makes boundary days safe.
 */
export function buildFilter(stream: Pick<GoogleStream, "dataType" | "filter">, startMs: number, endMs: number, timeZone = "UTC"): string {
  const f = filterName(stream.dataType);
  switch (stream.filter) {
    case "sample":
      return `${f}.sample_time.physical_time >= "${iso(startMs)}" AND ${f}.sample_time.physical_time < "${iso(endMs)}"`;
    case "interval":
      return `${f}.interval.start_time >= "${iso(startMs)}" AND ${f}.interval.start_time < "${iso(endMs)}"`;
    case "sleep":
      return `sleep.interval.end_time >= "${iso(startMs)}" AND sleep.interval.end_time < "${iso(endMs)}"`;
    case "daily":
      return `${f}.date >= "${isoDate(startMs)}" AND ${f}.date < "${isoDate(endMs)}"`;
    case "exercise": {
      const [from, to] = exerciseCivilWindow(startMs, endMs, timeZone);
      return `exercise.interval.civil_start_time >= "${from}" AND exercise.interval.civil_start_time < "${to}"`;
    }
    case "rollup":
      throw new Error(`${stream.dataType} is a rollup stream; it takes a civil date range, not a filter`);
  }
}

/** Civil dates [from, to) covering a UTC window, in the home time zone. */
export function exerciseCivilWindow(startMs: number, endMs: number, timeZone: string): [string, string] {
  return [civilDate(startMs, null, timeZone), civilDate(endMs, null, timeZone)];
}

/** Civil dates [from, to) for a rollup chunk. Chunks are UTC-midnight aligned, so the UTC date is the civil date. */
export function rollupRange(startMs: number, endMs: number): [string, string] {
  return [isoDate(startMs), isoDate(endMs)];
}

/** Split [fromMs, toMs) into chunks of `chunkDays`, oldest first. */
export function chunkWindows(fromMs: number, toMs: number, chunkDays: number): [number, number][] {
  const step = chunkDays * 86_400_000;
  const out: [number, number][] = [];
  for (let s = fromMs; s < toMs; s += step) out.push([s, Math.min(s + step, toMs)]);
  return out;
}
