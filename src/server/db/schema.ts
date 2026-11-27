import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/*
 * Storage layers (see docs/DATA_MODEL.md):
 *   1. raw_pages        — original provider responses, gzip-compressed, never modified.
 *   2. normalized tables — typed, unit-normalized rows that reference the raw page they came from.
 *   3. calculated metrics — computed on read by versioned pure functions (src/lib/metrics).
 *
 * All instants are UTC epoch milliseconds. Where the provider supplies the wearer's UTC offset
 * we store it (seconds) so civil days are computed from the offset that applied at that moment,
 * which keeps DST changes and travel correct.
 */

export const providerConnections = sqliteTable("provider_connections", {
  provider: text("provider", { enum: ["google", "hevy"] }).primaryKey(),
  status: text("status", { enum: ["connected", "reauth_required", "error", "disconnected"] }).notNull(),
  externalUserId: text("external_user_id"),
  scopes: text("scopes"),
  encAccessToken: text("enc_access_token"),
  encRefreshToken: text("enc_refresh_token"),
  accessExpiresAt: integer("access_expires_at"),
  encApiKey: text("enc_api_key"),
  connectedAt: integer("connected_at"),
  lastError: text("last_error"),
  updatedAt: integer("updated_at").notNull(),
});

export const rawPages = sqliteTable(
  "raw_pages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    resource: text("resource").notNull(), // e.g. "heart-rate:list"
    requestKey: text("request_key").notNull(), // canonical request description (no secrets)
    fetchedAt: integer("fetched_at").notNull(),
    httpStatus: integer("http_status").notNull(),
    bodySha256: text("body_sha256").notNull(),
    bodyGz: blob("body_gz", { mode: "buffer" }).notNull(),
  },
  (t) => [uniqueIndex("raw_pages_dedupe").on(t.provider, t.resource, t.bodySha256)],
);

/** Provenance of measurements: which platform/device/app produced them. */
export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    key: text("key").notNull(), // stable fingerprint of the fields below
    platform: text("platform"),
    recordingMethod: text("recording_method"),
    deviceFormFactor: text("device_form_factor"),
    deviceManufacturer: text("device_manufacturer"),
    deviceName: text("device_name"),
    appPackage: text("app_package"),
  },
  (t) => [uniqueIndex("sources_key").on(t.provider, t.key)],
);

/** Heart-rate samples — high volume, so a dedicated narrow table. */
export const heartRateSamples = sqliteTable(
  "heart_rate_samples",
  {
    sourceId: integer("source_id").notNull(),
    tMs: integer("t_ms").notNull(),
    utcOffsetS: integer("utc_offset_s"),
    bpm: integer("bpm").notNull(),
    motion: text("motion"), // ACTIVE | SEDENTARY | null
    rawPageId: integer("raw_page_id"),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.tMs] }), index("hr_t").on(t.tMs)],
);

/**
 * Generic time-series observations: interval data (steps/minute, distance, calories, active zone
 * minutes, …) and sparse samples (HRV, SpO2, weight, …). `variant` disambiguates records that share
 * an interval (e.g. activity level, heart-rate zone). Units are normalized (see docs/DATA_MODEL.md).
 */
export const observations = sqliteTable(
  "observations",
  {
    dataType: text("data_type").notNull(),
    sourceId: integer("source_id").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(), // == startMs for point samples
    variant: text("variant").notNull().default(""),
    utcOffsetS: integer("utc_offset_s"),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    attrs: text("attrs", { mode: "json" }).$type<Record<string, unknown>>(),
    recordName: text("record_name"),
    rawPageId: integer("raw_page_id"),
  },
  (t) => [
    primaryKey({ columns: [t.dataType, t.sourceId, t.startMs, t.endMs, t.variant] }),
    index("obs_type_time").on(t.dataType, t.startMs),
  ],
);

/** Provider-computed daily values (resting HR, daily HRV, SpO2, respiratory rate, skin temp, VO2max…). */
export const dailyMetrics = sqliteTable(
  "daily_metrics",
  {
    metric: text("metric").notNull(),
    date: text("date").notNull(), // civil date YYYY-MM-DD as reported by the provider
    sourceId: integer("source_id").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    attrs: text("attrs", { mode: "json" }).$type<Record<string, unknown>>(),
    rawPageId: integer("raw_page_id"),
  },
  (t) => [primaryKey({ columns: [t.metric, t.date, t.sourceId] })],
);

export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    id: text("id").primaryKey(), // provider record name
    sourceId: integer("source_id").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    startOffsetS: integer("start_offset_s"),
    endOffsetS: integer("end_offset_s"),
    sleepType: text("sleep_type"), // STAGES | CLASSIC
    isMain: integer("is_main", { mode: "boolean" }),
    isNap: integer("is_nap", { mode: "boolean" }),
    stagesStatus: text("stages_status"),
    summary: text("summary", { mode: "json" }).$type<Record<string, unknown>>(),
    updatedAt: integer("updated_at"),
    rawPageId: integer("raw_page_id"),
  },
  (t) => [index("sleep_end").on(t.endMs)],
);

export const sleepStages = sqliteTable(
  "sleep_stages",
  {
    sessionId: text("session_id").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    stage: text("stage").notNull(), // AWAKE | LIGHT | DEEP | REM | ASLEEP | RESTLESS
    isShortAwakening: integer("is_short_awakening", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.startMs, t.isShortAwakening] })],
);

/** Exercise sessions recorded by Google Health (auto-detected or started on device). */
export const exerciseSessions = sqliteTable(
  "exercise_sessions",
  {
    id: text("id").primaryKey(),
    sourceId: integer("source_id").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    startOffsetS: integer("start_offset_s"),
    exerciseType: text("exercise_type").notNull(),
    displayName: text("display_name"),
    activeDurationS: real("active_duration_s"),
    metrics: text("metrics", { mode: "json" }).$type<Record<string, unknown>>(),
    rawPageId: integer("raw_page_id"),
  },
  (t) => [index("exercise_start").on(t.startMs)],
);

export const hevyWorkouts = sqliteTable(
  "hevy_workouts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    routineId: text("routine_id"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    deletedAt: text("deleted_at"),
    rawPageId: integer("raw_page_id"),
  },
  (t) => [index("hevy_start").on(t.startMs)],
);

export const hevyExercises = sqliteTable(
  "hevy_exercises",
  {
    workoutId: text("workout_id").notNull(),
    idx: integer("idx").notNull(),
    templateId: text("template_id").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    supersetId: integer("superset_id"),
  },
  (t) => [primaryKey({ columns: [t.workoutId, t.idx] }), index("hevy_ex_template").on(t.templateId)],
);

export const hevySets = sqliteTable(
  "hevy_sets",
  {
    workoutId: text("workout_id").notNull(),
    exerciseIdx: integer("exercise_idx").notNull(),
    idx: integer("idx").notNull(),
    setType: text("set_type").notNull(), // normal | warmup | dropset | failure
    weightKg: real("weight_kg"),
    reps: real("reps"),
    distanceM: real("distance_m"),
    durationS: real("duration_s"),
    rpe: real("rpe"),
    customMetric: real("custom_metric"),
  },
  (t) => [primaryKey({ columns: [t.workoutId, t.exerciseIdx, t.idx] })],
);

export const hevyExerciseTemplates = sqliteTable("hevy_exercise_templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type"),
  primaryMuscle: text("primary_muscle"),
  secondaryMuscles: text("secondary_muscles", { mode: "json" }).$type<string[]>(),
  equipment: text("equipment"),
  isCustom: integer("is_custom", { mode: "boolean" }),
});

export const syncState = sqliteTable(
  "sync_state",
  {
    provider: text("provider").notNull(),
    stream: text("stream").notNull(),
    /** Everything strictly before this instant has been fetched at least once. */
    syncedThroughMs: integer("synced_through_ms"),
    /** Earliest instant fetched during backfill. */
    backfilledFromMs: integer("backfilled_from_ms"),
    cursor: text("cursor"),
    lastSuccessAt: integer("last_success_at"),
    lastAttemptAt: integer("last_attempt_at"),
    lastError: text("last_error"),
    rowsTotal: integer("rows_total").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.stream] })],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  trigger: text("trigger").notNull(), // manual | scheduled | cli
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  status: text("status", { enum: ["running", "success", "partial", "failed", "interrupted"] }).notNull(),
  stats: text("stats", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

/**
 * Layer 3 cache: per-civil-day values computed from normalized data by versioned functions in src/lib/metrics
 * (e.g. all-day TRIMP, minutes per %HRmax zone). Recomputed after every sync for the affected days; safe to drop.
 * Raw and normalized provider data are never modified.
 */
export const derivedDaily = sqliteTable(
  "derived_daily",
  {
    metric: text("metric").notNull(),
    date: text("date").notNull(),
    value: real("value").notNull(),
    version: text("version").notNull(),
    attrs: text("attrs", { mode: "json" }).$type<Record<string, unknown>>(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.metric, t.date] }), index("derived_daily_date").on(t.date)],
);

/** Owner decisions to leave a provider exercise session out of Baseline's analytics. Provider data stays untouched. */
export const exerciseExclusions = sqliteTable("exercise_exclusions", {
  sessionId: text("session_id").primaryKey(),
  reason: text("reason"),
  excludedAt: integer("excluded_at").notNull(),
});

/**
 * Owner labels for workouts (name, category, effort 1–10). Keyed by provider session id like exclusions, and written
 * for every session of a grouped workout so the label survives regrouping. Provider data stays untouched.
 */
export const workoutAnnotations = sqliteTable("workout_annotations", {
  sessionId: text("session_id").primaryKey(),
  name: text("name"),
  category: text("category"),
  effort: integer("effort"),
  updatedAt: integer("updated_at").notNull(),
});
