/**
 * Workout categories, effort and the cardio classification. Pure; shared by the server and the future iOS app.
 * A category set by the owner always wins over the provider's exercise type.
 */
export const WORKOUT_CATEGORIES = ["push", "pull", "legs", "upper", "full_body", "cardio", "rest"] as const;
export type WorkoutCategory = (typeof WORKOUT_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<WorkoutCategory, string> = {
  push: "Push", pull: "Pull", legs: "Legs", upper: "Upper body", full_body: "Full body", cardio: "Cardio", rest: "Rest / recovery",
};
export const isCategory = (v: unknown): v is WorkoutCategory => typeof v === "string" && (WORKOUT_CATEGORIES as readonly string[]).includes(v);

/** Google exercise types that are aerobic by nature (running, walking, cycling, swimming, rowing, …). */
const CARDIO_TYPE = /RUN|WALK|CYCL|BIK|SWIM|ELLIPT|ROW|HIIT|HIK|SPIN|STAIR|AEROB|DANCE|CARDIO|SKI|SKAT|JUMP_ROPE|SOCCER|TENNIS|BADMINTON|BASKET|HANDBALL/;

export function isCardio(exerciseType: string, category: WorkoutCategory | null | undefined): boolean {
  if (category) return category === "cardio";
  return CARDIO_TYPE.test(exerciseType.toUpperCase());
}

/** Effort: the owner's rating of perceived exertion, 1–10 (CR-10 style), or null when not rated. */
export const validEffort = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10;
