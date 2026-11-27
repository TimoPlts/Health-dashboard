import type { HevyTemplate, HevyWorkout } from "@/server/providers/hevy/client";

/** FICTIONAL Hevy fixtures shaped after https://developers.hevy.com/openapi.json. */
export function workout(id: string, start: string, end: string, title = "Push Day"): HevyWorkout {
  return {
    id, title, routine_id: null, description: null, start_time: start, end_time: end,
    created_at: end, updated_at: end,
    exercises: [
      {
        index: 0, title: "Bench Press (Barbell)", notes: null, exercise_template_id: "TPL_BENCH", superset_id: null,
        sets: [
          { index: 0, type: "warmup", weight_kg: 40, reps: 10, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
          { index: 1, type: "normal", weight_kg: 80, reps: 8, distance_meters: null, duration_seconds: null, rpe: 8, custom_metric: null },
          { index: 2, type: "normal", weight_kg: 80, reps: 7, distance_meters: null, duration_seconds: null, rpe: 9, custom_metric: null },
        ],
      },
      {
        index: 1, title: "Push Up", notes: null, exercise_template_id: "TPL_PUSHUP", superset_id: null,
        sets: [{ index: 0, type: "failure", weight_kg: null, reps: 20, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null }],
      },
    ],
  };
}

export const templates: HevyTemplate[] = [
  { id: "TPL_BENCH", title: "Bench Press (Barbell)", type: "weight_reps", primary_muscle_group: "chest", secondary_muscle_groups: ["triceps", "shoulders"], equipment: "barbell", is_custom: false },
  { id: "TPL_PUSHUP", title: "Push Up", type: "reps_only", primary_muscle_group: "chest", secondary_muscle_groups: ["triceps"], equipment: "none", is_custom: false },
];
