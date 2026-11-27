/**
 * Habit journal rules (journal@1). Pure. A habit that was not logged on a day has NO value — it is never read as
 * "no" or as zero. Booleans are stored as 1 (yes) / 0 (no); scales are 1–5; numbers are amounts with a unit.
 */
export type HabitKind = "boolean" | "number" | "scale";
export interface HabitDef { id: string; name: string; kind: HabitKind; unit: string | null; min: number | null; max: number | null; step: number | null }

/** Suggested habits, created once when the journal is first opened. All can be edited or removed. */
export const DEFAULT_HABITS: Omit<HabitDef, "id">[] = [
  { name: "Caffeine", kind: "number", unit: "cups", min: 0, max: 12, step: 1 },
  { name: "Supplements", kind: "boolean", unit: null, min: null, max: null, step: null },
  { name: "Creatine", kind: "boolean", unit: null, min: null, max: null, step: null },
  { name: "Stress", kind: "scale", unit: null, min: 1, max: 5, step: 1 },
  { name: "Late meal", kind: "boolean", unit: null, min: null, max: null, step: null },
  { name: "Alcohol", kind: "number", unit: "drinks", min: 0, max: 20, step: 1 },
  { name: "Stretching", kind: "boolean", unit: null, min: null, max: null, step: null },
  { name: "Fatigue", kind: "scale", unit: null, min: 1, max: 5, step: 1 },
];

export const SCALE_LABELS: Record<number, string> = { 1: "Very low", 2: "Low", 3: "Moderate", 4: "High", 5: "Very high" };

/** Validates a value for a habit; returns the normalised value or null when it is not acceptable. */
export function normaliseHabitValue(h: Pick<HabitDef, "kind" | "min" | "max" | "step">, v: unknown): number | null {
  if (typeof v === "boolean") return h.kind === "boolean" ? (v ? 1 : 0) : null;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (h.kind === "boolean") return v === 1 || v === 0 ? v : null;
  if (h.kind === "scale") return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
  if (h.min !== null && v < h.min) return null;
  if (h.max !== null && v > h.max) return null;
  return Math.round(v * 100) / 100;
}

export const formatHabitValue = (h: Pick<HabitDef, "kind" | "unit">, v: number) =>
  h.kind === "boolean" ? (v ? "Yes" : "No") : h.kind === "scale" ? `${v} · ${SCALE_LABELS[v] ?? ""}` : `${v}${h.unit ? ` ${h.unit}` : ""}`;
