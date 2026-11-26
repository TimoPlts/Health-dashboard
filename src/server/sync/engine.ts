import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { syncRuns, syncState } from "../db/schema";
import { GoogleHealthClient } from "../providers/google/client";
import { normalizeGoogle } from "../providers/google/normalize";
import { buildFilter, chunkWindows, GOOGLE_STREAMS, type GoogleStream } from "../providers/google/streams";
import { HevyClient } from "../providers/hevy/client";
import { markHevyWorkoutDeleted, storeRawPage, upsertHevyTemplate, upsertHevyWorkout, writeBatch } from "../store";
import { HttpError, redactUrl } from "../http";
import { OAuthError } from "../providers/google/oauth";

const DAY = 86_400_000;

export interface SyncLogger {
  info(msg: string): void;
  warn(msg: string): void;
}
const silent: SyncLogger = { info: () => {}, warn: () => {} };

export interface StreamResult { stream: string; ok: boolean; rows: number; pages: number; skipped: number; deleted: number; error?: string }

function getState(db: DB, provider: string, stream: string) {
  return db.select().from(syncState).where(and(eq(syncState.provider, provider), eq(syncState.stream, stream))).get();
}

function setState(db: DB, provider: string, stream: string, values: Partial<typeof syncState.$inferInsert>) {
  db.insert(syncState).values({ provider, stream, ...values })
    .onConflictDoUpdate({ target: [syncState.provider, syncState.stream], set: values }).run();
}

function startRun(db: DB, provider: string, trigger: string) {
  return db.insert(syncRuns).values({ provider, trigger, startedAt: Date.now(), status: "running" }).returning({ id: syncRuns.id }).get().id;
}

function finishRun(db: DB, id: number, results: StreamResult[], fatal?: string) {
  const failed = results.filter((r) => !r.ok).length;
  const status = fatal || (failed > 0 && failed === results.length) ? "failed" : failed > 0 ? "partial" : "success";
  db.update(syncRuns).set({ finishedAt: Date.now(), status, stats: { streams: results }, error: fatal ?? null }).where(eq(syncRuns.id, id)).run();
  return status;
}

/** Sanitized error text: no tokens, no query secrets, no health values. */
export function describeError(e: unknown): string {
  if (e instanceof HttpError) return `HTTP ${e.status} (${redactUrl(e.url).split("?")[0]}): ${e.bodySnippet.slice(0, 200)}`;
  if (e instanceof OAuthError) return `OAuth ${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message.slice(0, 300);
  return "Unknown error";
}

/** Window to fetch for a stream: backfill from `backfillDays` ago, or from syncedThrough − lookback. */
export function planWindow(stream: Pick<GoogleStream, "lookbackDays">, state: { syncedThroughMs: number | null } | undefined, now: number, backfillDays: number): [number, number] {
  const todayStart = Math.floor(now / DAY) * DAY;
  const end = todayStart + DAY; // include today (daily filters are date-granular)
  const backfillStart = todayStart - backfillDays * DAY;
  if (!state?.syncedThroughMs) return [backfillStart, end];
  const incremental = Math.floor((state.syncedThroughMs - stream.lookbackDays * DAY) / DAY) * DAY;
  return [Math.max(backfillStart, incremental), end];
}

export async function syncGoogle(
  db: DB,
  client: GoogleHealthClient,
  opts: { backfillDays: number; trigger?: string; streams?: string[]; now?: number; log?: SyncLogger },
): Promise<{ status: string; results: StreamResult[] }> {
  const log = opts.log ?? silent;
  const runId = startRun(db, "google", opts.trigger ?? "manual");
  const results: StreamResult[] = [];
  const now = opts.now ?? Date.now();
  const streams = GOOGLE_STREAMS.filter((s) => !opts.streams || opts.streams.includes(s.dataType));

  for (const stream of streams) {
    const r: StreamResult = { stream: stream.dataType, ok: true, rows: 0, pages: 0, skipped: 0, deleted: 0 };
    const state = getState(db, "google", stream.dataType);
    const [from, to] = planWindow(stream, state, now, opts.backfillDays);
    setState(db, "google", stream.dataType, { lastAttemptAt: Date.now() });
    try {
      for (const [ws, we] of chunkWindows(from, to, stream.chunkDays)) {
        const pagesInWindow: { batch: ReturnType<typeof normalizeGoogle>; rawId: number }[] = [];
        for await (const page of client.pages({ dataType: stream.dataType, method: stream.method, filter: buildFilter(stream, ws, we), pageSize: stream.pageSize, dataSourceFamily: stream.family })) {
          const rawId = storeRawPage(db, "google", `${stream.dataType}:${stream.method}`, page.requestKey, page.status, page.bodyText);
          pagesInWindow.push({ batch: normalizeGoogle(stream.dataType, page.dataPoints), rawId });
          r.pages++;
        }
        // Session streams: merge all pages of the window first so window-replacement sees every record.
        if (stream.replaceWindow) {
          const merged = pagesInWindow.reduce((acc, p) => {
            acc.sleep.push(...p.batch.sleep); acc.exercise.push(...p.batch.exercise); acc.skipped += p.batch.skipped; return acc;
          }, { hr: [], obs: [], daily: [], sleep: [], exercise: [], skipped: 0 } as ReturnType<typeof normalizeGoogle>);
          const s = writeBatch(db, merged, pagesInWindow[0]?.rawId ?? null, { kind: stream.dataType === "sleep" ? "sleep" : "exercise", startMs: ws, endMs: we });
          r.rows += s.sleep + s.exercise; r.deleted += s.deleted; r.skipped += merged.skipped;
        } else {
          for (const p of pagesInWindow) {
            const s = writeBatch(db, p.batch, p.rawId);
            r.rows += s.hr + s.obs + s.daily; r.skipped += p.batch.skipped;
          }
        }
        setState(db, "google", stream.dataType, {
          syncedThroughMs: Math.min(we, now),
          backfilledFromMs: Math.min(state?.backfilledFromMs ?? ws, ws),
        });
      }
      const prev = getState(db, "google", stream.dataType);
      setState(db, "google", stream.dataType, { lastSuccessAt: Date.now(), lastError: null, rowsTotal: (prev?.rowsTotal ?? 0) + r.rows });
      log.info(`google ${stream.dataType}: ${r.rows} rows, ${r.pages} pages, ${r.skipped} skipped`);
    } catch (e) {
      r.ok = false;
      r.error = describeError(e);
      setState(db, "google", stream.dataType, { lastError: r.error });
      log.warn(`google ${stream.dataType} failed: ${r.error}`);
      results.push(r);
      // Auth failures affect every stream — stop early instead of hammering the API.
      if (e instanceof OAuthError || (e instanceof HttpError && (e.status === 401 || e.status === 403))) {
        return { status: finishRun(db, runId, results, r.error), results };
      }
      continue;
    }
    results.push(r);
  }
  return { status: finishRun(db, runId, results), results };
}

export async function syncHevy(db: DB, client: HevyClient, opts: { trigger?: string; log?: SyncLogger; now?: number } = {}) {
  const log = opts.log ?? silent;
  const runId = startRun(db, "hevy", opts.trigger ?? "manual");
  const results: StreamResult[] = [];
  const started = new Date(opts.now ?? Date.now());

  // 1) Exercise templates (needed for muscle-group analytics). Full refresh; ~hundreds of rows.
  const tr: StreamResult = { stream: "exercise_templates", ok: true, rows: 0, pages: 0, skipped: 0, deleted: 0 };
  try {
    for await (const page of client.exerciseTemplates()) {
      storeRawPage(db, "hevy", "exercise_templates", page.requestKey, 200, page.bodyText);
      for (const x of page.items) { upsertHevyTemplate(db, x); tr.rows++; }
      tr.pages++;
    }
    setState(db, "hevy", "exercise_templates", { lastSuccessAt: Date.now(), lastError: null, rowsTotal: tr.rows });
  } catch (e) {
    tr.ok = false; tr.error = describeError(e);
    setState(db, "hevy", "exercise_templates", { lastError: tr.error, lastAttemptAt: Date.now() });
  }
  results.push(tr);
  log.info(`hevy templates: ${tr.rows}`);

  // 2) Workouts: full backfill once, then the events feed (updates + deletions) since the last cursor.
  const wr: StreamResult = { stream: "workouts", ok: true, rows: 0, pages: 0, skipped: 0, deleted: 0 };
  const state = getState(db, "hevy", "workouts");
  setState(db, "hevy", "workouts", { lastAttemptAt: Date.now() });
  try {
    if (!state?.cursor) {
      for await (const page of client.workouts()) {
        const rawId = storeRawPage(db, "hevy", "workouts", page.requestKey, 200, page.bodyText);
        for (const w of page.items) { upsertHevyWorkout(db, w, rawId); wr.rows++; }
        wr.pages++;
      }
    } else {
      for await (const page of client.workoutEvents(state.cursor)) {
        const rawId = storeRawPage(db, "hevy", "workout_events", page.requestKey, 200, page.bodyText);
        for (const ev of page.items) {
          if (ev.type === "updated") { upsertHevyWorkout(db, ev.workout, rawId); wr.rows++; }
          else if (ev.type === "deleted") { markHevyWorkoutDeleted(db, ev.id, ev.deleted_at); wr.deleted++; }
        }
        wr.pages++;
      }
    }
    // Cursor = sync start minus 5 min, so edits racing with this sync are fetched again next time (idempotent).
    const cursor = new Date(started.getTime() - 5 * 60_000).toISOString();
    setState(db, "hevy", "workouts", { cursor, syncedThroughMs: started.getTime(), lastSuccessAt: Date.now(), lastError: null, rowsTotal: (state?.rowsTotal ?? 0) + wr.rows });
  } catch (e) {
    wr.ok = false; wr.error = describeError(e);
    setState(db, "hevy", "workouts", { lastError: wr.error });
  }
  results.push(wr);
  log.info(`hevy workouts: ${wr.rows} upserted, ${wr.deleted} deleted`);
  return { status: finishRun(db, runId, results), results };
}
