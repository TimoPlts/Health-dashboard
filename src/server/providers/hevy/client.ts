import { createThrottle, fetchWithRetry, HttpError, type RetryOptions } from "../../http";

/** Hevy public API (OpenAPI: https://developers.hevy.com/openapi.json). Requires Hevy Pro. */
export const HEVY_BASE = "https://api.hevyapp.com";

export interface HevySet {
  index: number;
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
}
export interface HevyExercise {
  index: number;
  title: string;
  notes: string | null;
  exercise_template_id: string;
  superset_id: number | null;
  sets: HevySet[];
}
export interface HevyWorkout {
  id: string;
  title: string;
  routine_id?: string | null;
  description: string | null;
  start_time: string;
  end_time: string;
  updated_at: string;
  created_at: string;
  exercises: HevyExercise[];
}
export interface HevyTemplate {
  id: string;
  title: string;
  type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string[];
  equipment?: string;
  is_custom: boolean;
}
export type HevyEvent = { type: "updated"; workout: HevyWorkout } | { type: "deleted"; id: string; deleted_at?: string };

export interface HevyPage<T> {
  page: number;
  pageCount: number;
  items: T[];
  bodyText: string;
  requestKey: string;
}

export class HevyClient {
  // Hevy does not document rate limits; stay polite (≈2 req/s) and back off on 429.
  private throttle: () => Promise<void>;

  constructor(
    private readonly apiKey: string,
    private readonly retry: RetryOptions = {},
    throttleMs = 500,
  ) {
    this.throttle = createThrottle(throttleMs);
  }

  private async get(path: string, params: Record<string, string | number> = {}): Promise<{ json: Record<string, unknown>; text: string }> {
    await this.throttle();
    const u = new URL(path, HEVY_BASE);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const res = await fetchWithRetry(u.toString(), { headers: { "api-key": this.apiKey, accept: "application/json" } }, this.retry);
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, text.slice(0, 300), u.toString());
    return { json: JSON.parse(text) as Record<string, unknown>, text };
  }

  async userInfo() {
    const { json } = await this.get("/v1/user/info");
    return (json.data ?? json) as { id: string; username?: string; is_pro?: boolean; weight_unit?: string };
  }

  async workoutCount(): Promise<number> {
    const { json } = await this.get("/v1/workouts/count");
    return Number(json.workout_count ?? 0);
  }

  private async *paged<T>(path: string, key: string, pageSize: number, extra: Record<string, string> = {}): AsyncGenerator<HevyPage<T>> {
    let page = 1;
    for (;;) {
      const { json, text } = await this.get(path, { page, pageSize, ...extra });
      const pageCount = Number(json.page_count ?? 0);
      const items = (Array.isArray(json[key]) ? json[key] : []) as T[];
      yield { page, pageCount, items, bodyText: text, requestKey: `${path} ${JSON.stringify(extra)} p${page}` };
      if (page >= pageCount || items.length === 0) return;
      page++;
    }
  }

  workouts() {
    return this.paged<HevyWorkout>("/v1/workouts", "workouts", 10);
  }

  /** Updates/deletions since an ISO timestamp (newest first). */
  workoutEvents(sinceIso: string) {
    return this.paged<HevyEvent>("/v1/workouts/events", "events", 10, { since: sinceIso });
  }

  exerciseTemplates() {
    return this.paged<HevyTemplate>("/v1/exercise_templates", "exercise_templates", 100);
  }
}
