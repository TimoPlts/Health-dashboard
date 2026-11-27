import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { openDatabase, type DB } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { GoogleHealthClient } from "@/server/providers/google/client";
import { HevyClient } from "@/server/providers/hevy/client";
import { closeInterruptedRuns, syncGoogle, syncHevy } from "@/server/sync/engine";
import { lockOwnerAlive } from "@/server/sync/run";
import { readRawPage } from "@/server/store";
import { exchangeCode, refreshAccessToken, OAuthError } from "@/server/providers/google/oauth";
import { hrPoint, sleepPoint, stepsPoint } from "../fixtures/google";
import { templates, workout } from "../fixtures/hevy";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NOW = Date.UTC(2026, 2, 3, 12);

/** Does the [>= a AND < b) filter window of this request contain `iso`? */
function windowContains(u: URL, iso: string) {
  const m = />= "([^"]+)".*< "([^"]+)"/.exec(u.searchParams.get("filter") ?? "");
  return !!m && m[1]! <= iso && iso < m[2]!;
}

let db: DB;
beforeEach(() => { db = openDatabase(":memory:"); });

function googleFetch(handlers: Record<string, (u: URL, init?: RequestInit) => Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const type = /dataTypes\/([^/]+)\/dataPoints/.exec(u.pathname)?.[1] ?? "";
    return (handlers[type] ?? (() => json({ dataPoints: [] })))(u, init);
  });
}

describe("Google sync", () => {
  it("backfills, paginates, stores raw pages and is idempotent on re-run", async () => {
    const hrPages: Record<string, unknown> = {
      first: { dataPoints: [hrPoint("2026-03-02T17:00:00Z", 110), hrPoint("2026-03-02T17:00:05Z", 115)], nextPageToken: "p2" },
      p2: { dataPoints: [hrPoint("2026-03-02T17:00:10Z", 120)] },
    };
    const f = googleFetch({
      "heart-rate": (u) => {
        const inDay = u.searchParams.get("filter")!.includes('>= "2026-03-02T00:00:00Z"');
        if (!inDay) return json({ dataPoints: [] });
        return json(hrPages[u.searchParams.get("pageToken") ?? "first"]);
      },
      steps: (u) => (u.pathname.endsWith(":reconcile") && windowContains(u, "2026-03-02T08:00:00Z")
        ? json({ dataPoints: [stepsPoint("2026-03-02T08:00:00Z", "2026-03-02T08:01:00Z", 97)] }) : json({ dataPoints: [] })),
    });
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, undefined, 0);
    const run = () => syncGoogle(db, client, { backfillDays: 3, now: NOW, streams: ["heart-rate", "steps"] });

    const r1 = await run();
    expect(r1.status).toBe("success");
    expect(db.select({ n: count() }).from(t.heartRateSamples).get()!.n).toBe(3);
    expect(db.select({ n: count() }).from(t.observations).get()!.n).toBe(1);
    // filter param must carry the dataSourceFamily for HR
    const hrCall = f.mock.calls.map((c) => String(c[0])).find((u) => u.includes("heart-rate"))!;
    expect(decodeURIComponent(hrCall)).toContain("dataSourceFamilies/google-wearables");

    const raw = db.select().from(t.rawPages).all();
    expect(raw.length).toBeGreaterThan(0);
    expect(readRawPage(db, raw[0]!.id)).toContain("dataPoints");

    await run(); // same data again
    expect(db.select({ n: count() }).from(t.heartRateSamples).get()!.n).toBe(3);
    expect(db.select({ n: count() }).from(t.observations).get()!.n).toBe(1);
    const st = db.select().from(t.syncState).where(eq(t.syncState.stream, "heart-rate")).get()!;
    expect(st.lastSuccessAt).toBeTruthy();
    expect(st.syncedThroughMs).toBe(NOW);
  });

  it("removes sleep sessions that disappear from a re-fetched window", async () => {
    let returnSleep = true;
    const f = googleFetch({ sleep: (u) => (returnSleep && u.searchParams.get("filter")!.includes("2026-02-") ? json({ dataPoints: [sleepPoint] }) : json({ dataPoints: [] })) });
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, undefined, 0);
    await syncGoogle(db, client, { backfillDays: 5, now: NOW, streams: ["sleep"] });
    expect(db.select().from(t.sleepSessions).all()).toHaveLength(1);
    expect(db.select().from(t.sleepStages).all()).toHaveLength(4);
    returnSleep = false;
    await syncGoogle(db, client, { backfillDays: 5, now: NOW, streams: ["sleep"] });
    expect(db.select().from(t.sleepSessions).all()).toHaveLength(0);
    expect(db.select().from(t.sleepStages).all()).toHaveLength(0);
  });

  it("records a failed stream without aborting others, and stops on auth errors", async () => {
    const f = googleFetch({ "heart-rate": () => json({ error: { message: "bad filter" } }, 400) });
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, undefined, 0);
    const r = await syncGoogle(db, client, { backfillDays: 1, now: NOW, streams: ["heart-rate", "steps"] });
    expect(r.status).toBe("partial");
    expect(r.results.find((x) => x.stream === "heart-rate")!.error).toContain("HTTP 400");
    expect(r.results.find((x) => x.stream === "steps")!.ok).toBe(true);

    const f401 = googleFetch({ "heart-rate": () => json({}, 401) });
    const c401 = new GoogleHealthClient(async () => "tok", { fetchImpl: f401, sleep: async () => {} }, undefined, 0);
    const r401 = await syncGoogle(db, c401, { backfillDays: 1, now: NOW, streams: ["heart-rate", "steps"] });
    expect(r401.status).toBe("failed");
    expect(r401.results).toHaveLength(1);
  });

  it("daily rollups: POSTs a civil range and stores one row per day with a value", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = googleFetch({
      "total-calories": (u, init) => {
        expect(u.pathname.endsWith(":dailyRollUp")).toBe(true);
        expect(init?.method).toBe("POST");
        bodies.push(JSON.parse(String(init?.body)));
        return json({ rollupDataPoints: [
          { civilStartTime: { date: { year: 2026, month: 3, day: 2 } }, totalCalories: { kcalSum: 2300 } },
          { civilStartTime: { date: { year: 2026, month: 3, day: 3 } } }, // nothing measured → no row
        ] });
      },
    });
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, undefined, 0);
    const r = await syncGoogle(db, client, { backfillDays: 2, now: NOW, streams: ["total-calories:daily-rollup"] });
    expect(r.status).toBe("success");
    expect(bodies[0]).toMatchObject({ range: { start: { date: { year: 2026, month: 3, day: 1 } }, end: { date: { year: 2026, month: 3, day: 4 } } }, windowSizeDays: 1 });
    const rows = db.select().from(t.dailyMetrics).where(eq(t.dailyMetrics.metric, "total_kcal")).all();
    expect(rows.map((x) => [x.date, x.value])).toEqual([["2026-03-02", 2300]]);
    expect(db.select().from(t.syncState).where(eq(t.syncState.stream, "total-calories:daily-rollup")).get()?.lastSuccessAt).toBeTruthy();
  });

  it("exercise: civil-date filter, and only sessions on the re-fetched civil dates are replaced", async () => {
    const ex = (id: string, start: string, end: string) => ({
      name: `users/me/dataTypes/exercise/dataPoints/${id}`, dataSource: { platform: "FITBIT" },
      exercise: { interval: { startTime: start, startUtcOffset: "3600s", endTime: end, endUtcOffset: "3600s" }, exerciseType: "WALKING" },
    });
    // 23:30Z on Mar 1 = 00:30 on Mar 2 in Brussels: belongs to civil date Mar 2.
    const late = ex("late", "2026-03-01T23:30:00Z", "2026-03-02T00:10:00Z");
    let returnLate = true;
    const filters: string[] = [];
    const f = googleFetch({
      exercise: (u) => {
        const flt = u.searchParams.get("filter")!;
        filters.push(flt);
        return json({ dataPoints: returnLate && windowContains(u, "2026-03-02") ? [late] : [] });
      },
    });
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, undefined, 0);
    await syncGoogle(db, client, { backfillDays: 5, now: NOW, streams: ["exercise"], timeZone: "Europe/Brussels" });
    expect(filters[0]).toMatch(/^exercise\.interval\.civil_start_time >= "\d{4}-\d{2}-\d{2}" AND exercise\.interval\.civil_start_time < "\d{4}-\d{2}-\d{2}"$/);
    expect(db.select().from(t.exerciseSessions).all()).toHaveLength(1);
    returnLate = false;
    await syncGoogle(db, client, { backfillDays: 5, now: NOW, streams: ["exercise"], timeZone: "Europe/Brussels" });
    expect(db.select().from(t.exerciseSessions).all()).toHaveLength(0);
  });

  it("a small sync, then a full backfill, then an incremental sync: history is kept and not re-fetched", async () => {
    const f = googleFetch({});
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, undefined, 0);
    const opts = { now: NOW, streams: ["steps"] };
    await syncGoogle(db, client, { ...opts, backfillDays: 2 });
    await syncGoogle(db, client, { ...opts, backfillDays: 60 });
    const st = db.select().from(t.syncState).where(eq(t.syncState.stream, "steps")).get()!;
    expect(st.backfilledFromMs).toBe(Date.UTC(2026, 2, 3) - 60 * 86_400_000);
    expect(st.syncedThroughMs).toBe(NOW);
    f.mockClear();
    await syncGoogle(db, client, { ...opts, backfillDays: 60 });
    expect(f.mock.calls.length).toBeLessThanOrEqual(2); // lookback only (chunks of 3 days)
  });

  it("refreshes once on 401 then succeeds", async () => {
    let calls = 0;
    const f = vi.fn(async () => (calls++ === 0 ? json({}, 401) : json({ dataPoints: [] })));
    const onUnauth = vi.fn(async () => {});
    const client = new GoogleHealthClient(async () => "tok", { fetchImpl: f, sleep: async () => {} }, onUnauth, 0);
    const r = await syncGoogle(db, client, { backfillDays: 0, now: NOW, streams: ["steps"] });
    expect(onUnauth).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("success");
  });
});

describe("Google OAuth token exchange", () => {
  const cfg = { clientId: "c", clientSecret: "s", redirectUri: "http://localhost:3000/cb" };
  it("exchanges a code with the PKCE verifier", async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(init!.body as URLSearchParams);
      expect(body.get("code_verifier")).toBe("ver");
      expect(body.get("grant_type")).toBe("authorization_code");
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3599, scope: "a b" });
    });
    const tok = await exchangeCode(cfg, "code", "ver", { fetchImpl: f as typeof fetch });
    expect(tok).toMatchObject({ accessToken: "at", refreshToken: "rt", scope: "a b" });
  });
  it("maps invalid_grant to a re-auth error (e.g. 7-day Testing-mode expiry)", async () => {
    const f = vi.fn(async () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
    const err = await refreshAccessToken(cfg, "rt", { fetchImpl: f as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).requiresReauth).toBe(true);
  });
});

describe("Hevy sync", () => {
  function hevyFetch(state: { events: unknown[] }) {
    return vi.fn(async (input: string | URL | Request) => {
      const u = new URL(String(input));
      if (u.pathname === "/v1/exercise_templates") return json({ page: 1, page_count: 1, exercise_templates: templates });
      if (u.pathname === "/v1/workouts") {
        const page = Number(u.searchParams.get("page"));
        return json(page === 1
          ? { page: 1, page_count: 2, workouts: [workout("w1", "2026-03-02T17:00:00Z", "2026-03-02T18:00:00Z")] }
          : { page: 2, page_count: 2, workouts: [workout("w2", "2026-03-01T17:00:00Z", "2026-03-01T18:10:00Z", "Pull Day")] });
      }
      if (u.pathname === "/v1/workouts/events") {
        expect(u.searchParams.get("since")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        return json({ page: 1, page_count: 1, events: state.events });
      }
      return json({}, 404);
    });
  }

  it("backfills all pages, then applies update + delete events idempotently", async () => {
    const state = { events: [] as unknown[] };
    const client = new HevyClient("key", { fetchImpl: hevyFetch(state), sleep: async () => {} }, 0);
    await syncHevy(db, client, { now: NOW });
    expect(db.select().from(t.hevyWorkouts).all()).toHaveLength(2);
    expect(db.select().from(t.hevySets).where(eq(t.hevySets.workoutId, "w1")).all()).toHaveLength(4);
    expect(db.select().from(t.hevyExerciseTemplates).all()).toHaveLength(2);

    const edited = workout("w1", "2026-03-02T17:00:00Z", "2026-03-02T18:05:00Z", "Push Day (edited)");
    edited.exercises = edited.exercises.slice(0, 1);
    state.events = [{ type: "updated", workout: edited }, { type: "deleted", id: "w2", deleted_at: "2026-03-03T10:00:00Z" }];
    await syncHevy(db, client, { now: NOW + 3_600_000 });
    await syncHevy(db, client, { now: NOW + 7_200_000 }); // replay — must not duplicate

    const w1 = db.select().from(t.hevyWorkouts).where(eq(t.hevyWorkouts.id, "w1")).get()!;
    expect(w1.title).toBe("Push Day (edited)");
    expect(db.select().from(t.hevySets).where(eq(t.hevySets.workoutId, "w1")).all()).toHaveLength(3);
    expect(db.select().from(t.hevyWorkouts).where(eq(t.hevyWorkouts.id, "w2")).get()!.deletedAt).toBe("2026-03-03T10:00:00Z");
    expect(db.select().from(t.hevyWorkouts).all()).toHaveLength(2);
  });
});

describe("sync run bookkeeping", () => {
  it("marks runs left 'running' by a stopped process as interrupted", () => {
    db.insert(t.syncRuns).values([
      { provider: "google", trigger: "scheduled", startedAt: NOW - 60_000, status: "running" },
      { provider: "google", trigger: "manual", startedAt: NOW - 120_000, finishedAt: NOW - 90_000, status: "success" },
    ]).run();
    expect(closeInterruptedRuns(db)).toBe(1);
    expect(db.select().from(t.syncRuns).all().map((r) => r.status).sort()).toEqual(["interrupted", "success"]);
  });
  it("a lock file whose owner process is gone is stale; a live or unknown owner is respected", () => {
    expect(lockOwnerAlive(JSON.stringify({ pid: 999_999, at: NOW }), () => false)).toBe(false);
    expect(lockOwnerAlive(JSON.stringify({ pid: 999_999, at: NOW }), () => true)).toBe(true);
    expect(lockOwnerAlive(JSON.stringify({ pid: process.pid, at: NOW }), () => false)).toBe(true);
    expect(lockOwnerAlive("not json", () => false)).toBe(true);
  });
});
