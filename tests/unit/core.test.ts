import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from "@/server/crypto";
import { createThrottle, fetchWithRetry, parseRetryAfter, redactUrl } from "@/server/http";
import { civilDate, civilDayBounds } from "@/lib/time";
import { planWindow } from "@/server/sync/engine";
import { buildAuthorizationUrl, createPkcePair } from "@/server/providers/google/oauth";
import { createHash } from "node:crypto";

describe("crypto", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips and authenticates ciphertext", () => {
    const c = encryptSecret("refresh-token-value", key);
    expect(c).not.toContain("refresh-token-value");
    expect(decryptSecret(c, key)).toBe("refresh-token-value");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(c, randomBytes(32).toString("base64"))).toThrow();
  });
  it("rejects wrong key sizes", () => {
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow();
  });
  it("hashes and verifies passwords", () => {
    const h = hashPassword("correct horse");
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  const ok = () => new Response("{}", { status: 200 });
  it("retries 429/503 with backoff then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(ok());
    const sleeps: number[] = [];
    const r = await fetchWithRetry("https://x.test", {}, { fetchImpl: f, sleep: async (ms) => { sleeps.push(ms); }, random: () => 1 });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });
  it("honours Retry-After", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "7" } })).mockResolvedValueOnce(ok());
    const sleeps: number[] = [];
    await fetchWithRetry("https://x.test", {}, { fetchImpl: f, sleep: async (ms) => { sleeps.push(ms); } });
    expect(sleeps).toEqual([7000]);
  });
  it("does not retry 4xx client errors", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 400 }));
    const r = await fetchWithRetry("https://x.test", {}, { fetchImpl: f, sleep: async () => {} });
    expect(r.status).toBe(400);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("gives up after the retry budget and rethrows network errors", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("network down"));
    await expect(fetchWithRetry("https://x.test", {}, { fetchImpl: f, retries: 2, sleep: async () => {} })).rejects.toThrow("network down");
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("parses Retry-After and redacts secrets in URLs", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(redactUrl("https://a.test/x?code=abc&page=2&access_token=t")).toBe("https://a.test/x?code=REDACTED&page=2&access_token=REDACTED");
  });
  it("throttle spaces calls", async () => {
    let now = 0; const waits: number[] = [];
    const th = createThrottle(250, () => now, async (ms) => { waits.push(ms); });
    await th(); await th(); await th();
    expect(waits).toEqual([250, 500]);
  });
});

describe("time zones", () => {
  it("uses the provider offset for civil date", () => {
    // 23:30 UTC with +02:00 offset is the next civil day
    expect(civilDate(Date.UTC(2026, 6, 1, 23, 30), 7200, "UTC")).toBe("2026-07-02");
  });
  it("falls back to the home zone (Brussels summer time)", () => {
    expect(civilDate(Date.UTC(2026, 6, 1, 22, 30), null, "Europe/Brussels")).toBe("2026-07-02");
  });
  it("civil day bounds handle DST (23 h and 25 h days)", () => {
    const [s1, e1] = civilDayBounds("2026-03-29", "Europe/Brussels"); // spring forward
    expect((e1 - s1) / 3_600_000).toBe(23);
    expect(s1).toBe(Date.UTC(2026, 2, 28, 23));
    const [s2, e2] = civilDayBounds("2026-10-25", "Europe/Brussels"); // fall back
    expect((e2 - s2) / 3_600_000).toBe(25);
  });
});

describe("sync planning", () => {
  const now = Date.UTC(2026, 10, 26, 12);
  it("backfills on first run and includes today", () => {
    const [from, to] = planWindow({ lookbackDays: 2 }, undefined, now, 30);
    expect(from).toBe(Date.UTC(2026, 9, 27));
    expect(to).toBe(Date.UTC(2026, 10, 27));
  });
  it("re-fetches a lookback window on incremental runs", () => {
    const [from] = planWindow({ lookbackDays: 2 }, { syncedThroughMs: Date.UTC(2026, 10, 26, 10) }, now, 30);
    expect(from).toBe(Date.UTC(2026, 10, 24));
  });
  it("extends history backwards when backfillDays grows after a small verification sync", () => {
    const state = { syncedThroughMs: Date.UTC(2026, 10, 26, 10), backfilledFromMs: Date.UTC(2026, 10, 24) };
    expect(planWindow({ lookbackDays: 2 }, state, now, 2)[0]).toBe(Date.UTC(2026, 10, 24)); // incremental
    expect(planWindow({ lookbackDays: 2 }, state, now, 365)[0]).toBe(Date.UTC(2025, 10, 26)); // full backfill
  });
});

describe("Google OAuth URL", () => {
  it("uses PKCE S256, offline access and read-only scopes", () => {
    const { verifier, challenge } = createPkcePair();
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
    const u = new URL(buildAuthorizationUrl({ clientId: "cid", clientSecret: "s", redirectUri: "http://localhost:3000/cb" }, "st", challenge));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")!.split(" ").every((s) => s.endsWith(".readonly"))).toBe(true);
    expect(u.toString()).not.toContain("client_secret");
  });
});
