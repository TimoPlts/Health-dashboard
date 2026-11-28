/**
 * Customisable Today dashboard: which cards exist, their default order, and how a saved preference is resolved
 * against the current card list. Pure (shared by server, client and the future iOS app).
 */
export const TODAY_CARDS = [
  { id: "hero", label: "Recovery, sleep & load", hint: "Score rings and readiness" },
  { id: "weight", label: "Weight", hint: "Quick morning weigh-in" },
  { id: "goals", label: "Goals", hint: "Today's and this week's progress" },
  { id: "lastNight", label: "Last night", hint: "Time asleep and stages" },
  { id: "favorites", label: "Favourite metrics", hint: "The measurements you pick" },
  { id: "vitals", label: "Vitals", hint: "Resting HR, HRV, breathing, SpO₂, temperature" },
  { id: "activity", label: "Activity", hint: "Steps, energy, zone minutes" },
  { id: "journal", label: "Journal", hint: "Quick daily habit entry" },
  { id: "workouts", label: "Workouts", hint: "Today's sessions" },
] as const;
export type TodayCardId = (typeof TODAY_CARDS)[number]["id"];
export const isTodayCard = (v: unknown): v is TodayCardId => typeof v === "string" && TODAY_CARDS.some((c) => c.id === v);

export interface TodayLayout { order: TodayCardId[]; hidden: TodayCardId[]; favorites: string[] }
export const DEFAULT_FAVORITES = ["steps", "sleep_asleep", "hrv", "resting_hr"];
export const MAX_FAVORITES = 8;
export const DEFAULT_LAYOUT: TodayLayout = { order: TODAY_CARDS.map((c) => c.id), hidden: [], favorites: DEFAULT_FAVORITES };

/**
 * Resolve a saved layout: unknown ids are dropped, duplicates removed, and cards added in later versions are
 * appended at the end, so they are never lost and your saved order is never shuffled. Favourites are limited to known metric ids.
 */
export function resolveLayout(saved: Partial<TodayLayout> | null | undefined, knownMetricIds: Set<string>): TodayLayout {
  const order = [...new Set((saved?.order ?? []).filter(isTodayCard))];
  for (const c of DEFAULT_LAYOUT.order) if (!order.includes(c)) order.push(c); // new cards go last; your order is kept
  const hidden = [...new Set((saved?.hidden ?? []).filter(isTodayCard))];
  const favorites = [...new Set((saved?.favorites ?? DEFAULT_FAVORITES).filter((id) => knownMetricIds.has(id)))].slice(0, MAX_FAVORITES);
  return { order, hidden, favorites };
}
