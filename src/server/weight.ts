import { sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { writeBatch } from "./store";
import { emptyBatch, type SourceDescriptor } from "./providers/google/normalize";

/**
 * Body weight: Google's weight records (synced with the other streams) plus manual entries stored as observations
 * with Baseline's own source, so every weight chart and metric includes both. Manual entries are never sent to Google
 * (read-only access) and are never touched by sync.
 */
export const MANUAL_SOURCE: SourceDescriptor = { provider: "baseline", platform: "MANUAL", deviceName: "Manual entry" };
export const DUPLICATE_WINDOW_MS = 30 * 60_000;
export const DUPLICATE_KG = 0.1;

export interface WeightEntry { tMs: number; offsetS: number | null; kg: number; manual: boolean; source: string }

export function listWeights(db: DB, fromMs: number, toMs: number): WeightEntry[] {
  const rows = db.all(sql`
    select o.start_ms as tMs, o.utc_offset_s as offsetS, o.value as kg, s.provider as provider, s.platform as platform, s.device_name as deviceName, s.app_package as app
    from observations o left join sources s on s.id = o.source_id
    where o.data_type = 'weight' and o.start_ms >= ${fromMs} and o.start_ms < ${toMs} order by o.start_ms`) as { tMs: number; offsetS: number | null; kg: number; provider: string; platform: string | null; deviceName: string | null; app: string | null }[];
  return rows.map((r) => ({
    tMs: r.tMs, offsetS: r.offsetS, kg: r.kg, manual: r.provider === "baseline",
    source: r.provider === "baseline" ? "Manual entry" : r.deviceName ?? (r.app ? `Google (${r.app})` : "Google Health"),
  }));
}

/**
 * Add a manual weight. Refused as a duplicate when any entry (manual or from Google) lies within 30 minutes and
 * 0.1 kg — e.g. the same weigh-in already arrived from a smart scale via Google.
 */
export function addManualWeight(db: DB, e: { tMs: number; offsetS: number; kg: number }): { ok: true } | { ok: false; reason: "duplicate" | "range" } {
  if (!(e.kg >= 25 && e.kg <= 350)) return { ok: false, reason: "range" };
  const near = listWeights(db, e.tMs - DUPLICATE_WINDOW_MS, e.tMs + DUPLICATE_WINDOW_MS + 1);
  if (near.some((w) => Math.abs(w.kg - e.kg) <= DUPLICATE_KG)) return { ok: false, reason: "duplicate" };
  const b = emptyBatch();
  b.obs.push({ source: MANUAL_SOURCE, dataType: "weight", startMs: e.tMs, endMs: e.tMs, variant: "", utcOffsetS: e.offsetS, value: Math.round(e.kg * 100) / 100, unit: "kg" });
  writeBatch(db, b, null);
  return { ok: true };
}

/** Delete a manual entry. Google records cannot be deleted here (they would come back with the next sync). */
export function deleteManualWeight(db: DB, tMs: number): boolean {
  const r = db.run(sql`delete from observations where data_type = 'weight' and start_ms = ${tMs}
    and source_id in (select id from sources where provider = 'baseline' and platform = 'MANUAL')`);
  return r.changes > 0;
}
