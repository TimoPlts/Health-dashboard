import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSessionValue, sessionClaims, SESSION_TTL_MS, verifySessionValue } from "@/server/session";
import {
  authStateFile, clearLoginFailures, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS, loginLocked, readAuthState, recordLoginFailure,
  revokeAllSessions, revokeSession, sessionRevocation,
} from "@/server/auth-state";
import { tailnetAllowed, viaProxy } from "@/server/request";
import { assertSafeLocation, baselineHome, realLocation, runtimePaths, secretsInRepoEnvFiles, UnsafePathError } from "@/server/runtime-home";

// FICTIONAL secrets, hosts and logins only.
const SECRET = "test-secret-not-real";
const NOW = Date.UTC(2026, 10, 1);
const penv = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv;
let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "baseline-sec-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("test isolation", () => {
  it("tests run against a throwaway BASELINE_HOME, never the owner's runtime folder", () => {
    const home = runtimePaths().home;
    expect(home).toBe(path.resolve(process.env.BASELINE_HOME!));
    expect(home.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    const real = baselineHome(penv({ LOCALAPPDATA: process.env.LOCALAPPDATA }), process.platform);
    expect(home.toLowerCase()).not.toBe(real.toLowerCase());
    expect(process.env.DATABASE_PATH!.startsWith(home)).toBe(true);
  });
});

describe("session tokens", () => {
  it("round-trips and carries a random id", async () => {
    const a = await createSessionValue(SECRET, NOW), b = await createSessionValue(SECRET, NOW);
    expect(await verifySessionValue(a, SECRET, NOW)).toBe(true);
    expect(sessionClaims(a)!.id).not.toBe(sessionClaims(b)!.id);
    expect(sessionClaims(a)!.expiresAt - sessionClaims(a)!.issuedAt).toBe(SESSION_TTL_MS);
  });
  it("rejects tampering, a wrong secret, the legacy format, future issue times and stretched lifetimes", async () => {
    const v = await createSessionValue(SECRET, NOW);
    const [p, iat, exp, id, sig] = v.split(".");
    expect(await verifySessionValue(v, "other-secret", NOW)).toBe(false);
    expect(await verifySessionValue([p, iat, String(Number(exp) + 1), id, sig].join("."), SECRET, NOW)).toBe(false);
    expect(await verifySessionValue([p, iat, exp, "A".repeat(22), sig].join("."), SECRET, NOW)).toBe(false);
    expect(await verifySessionValue(`${exp}.${sig}`, SECRET, NOW)).toBe(false); // pre-0.6.0 "<exp>.<sig>"
    const future = await createSessionValue(SECRET, NOW + 10 * 60_000);
    expect(await verifySessionValue(future, SECRET, NOW)).toBe(false);
    expect(await verifySessionValue(v, SECRET, NOW + SESSION_TTL_MS + 1)).toBe(false);
  });
  it("is rejected after logout (revoked id) and after a password change (revokedBefore)", async () => {
    const v = await createSessionValue(SECRET, NOW);
    expect(await verifySessionValue(v, SECRET, NOW, { isRevoked: (id) => id === sessionClaims(v)!.id })).toBe(false);
    expect(await verifySessionValue(v, SECRET, NOW + 1, { revokedBefore: NOW + 1 })).toBe(false);
    expect(await verifySessionValue(v, SECRET, NOW + 1, { revokedBefore: NOW })).toBe(true);
  });
});

describe("persistent auth state", () => {
  it("logout revocation survives a restart and only affects that session", async () => {
    const file = authStateFile(dir);
    const a = await createSessionValue(SECRET, NOW), b = await createSessionValue(SECRET, NOW);
    revokeSession(sessionClaims(a)!.id, sessionClaims(a)!.expiresAt, file, NOW);
    vi.resetModules(); // simulate a restart: fresh module state, same file
    const fresh = await import("@/server/auth-state");
    const r = fresh.sessionRevocation(file, NOW);
    expect(await verifySessionValue(a, SECRET, NOW, r)).toBe(false);
    expect(await verifySessionValue(b, SECRET, NOW, r)).toBe(true);
  });
  it("revoking all sessions ends every earlier session but not new ones", async () => {
    const file = authStateFile(dir);
    const old = await createSessionValue(SECRET, NOW);
    revokeAllSessions(file, NOW + 1000);
    const later = await createSessionValue(SECRET, NOW + 2000);
    expect(await verifySessionValue(old, SECRET, NOW + 2000, sessionRevocation(file, NOW + 2000))).toBe(false);
    expect(await verifySessionValue(later, SECRET, NOW + 2000, sessionRevocation(file, NOW + 2000))).toBe(true);
  });
  it("revoked ids are pruned after they expire", () => {
    const file = authStateFile(dir);
    revokeSession("x".repeat(22), NOW + 1000, file, NOW);
    revokeSession("y".repeat(22), NOW + 10, file, NOW + 500); // already expired when written → pruned
    expect(Object.keys(readAuthState(file, NOW + 500).revoked)).toEqual(["x".repeat(22)]);
  });
  it("the login brake survives a restart and expires after the window", async () => {
    const file = authStateFile(dir);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) recordLoginFailure(file, NOW + i);
    vi.resetModules();
    const fresh = await import("@/server/auth-state");
    expect(fresh.loginLocked(file, NOW + 1000)).toBe(true);
    expect(fresh.loginLocked(file, NOW + LOGIN_WINDOW_MS + LOGIN_MAX_FAILURES + 1)).toBe(false);
    clearLoginFailures(file, NOW + 1000);
    expect(loginLocked(file, NOW + 1000)).toBe(false);
  });
  it("a corrupt state file fails closed: every existing session is rejected", async () => {
    const file = authStateFile(dir);
    const v = await createSessionValue(SECRET, NOW);
    writeFileSync(file, "{not json");
    const r = sessionRevocation(file, NOW + 5);
    expect(r.revokedBefore).toBe(NOW + 5);
    expect(await verifySessionValue(v, SECRET, NOW + 5, r)).toBe(false);
  });
});

describe("tailnet gate fails closed", () => {
  const TS = "baseline-pc.example-tailnet.ts.net";
  const req = (url: string, headers: Record<string, string>) => new Request(url, { headers });
  const local = (extra: Record<string, string> = {}) =>
    req("http://127.0.0.1:3000/", { host: "127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1", ...extra });

  it("direct local requests are not proxied and pass (IPv4, IPv6, mapped)", () => {
    for (const xff of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(viaProxy(local({ "x-forwarded-for": xff }))).toBe(false);
      expect(tailnetAllowed(local({ "x-forwarded-for": xff }))).toBe(true);
    }
    expect(tailnetAllowed(req("http://localhost:3000/", { host: "localhost:3000" }))).toBe(true); // headers not yet filled
  });
  it("a forged loopback Host through Serve does not bypass the identity or allowlist checks", () => {
    const forged = { host: "localhost:3000", "x-forwarded-host": "localhost:3000", "x-forwarded-for": "100.64.0.2" };
    expect(tailnetAllowed(req("http://localhost:3000/", forged))).toBe(false); // no identity (e.g. tagged node)
    const withId = { ...forged, "tailscale-user-login": "someone@example.com" };
    expect(tailnetAllowed(req("http://localhost:3000/", withId), "owner@example.com")).toBe(false);
    expect(tailnetAllowed(req("http://localhost:3000/", withId), "someone@example.com")).toBe(true);
  });
  it("Funnel is refused even with a loopback Host or an identity", () => {
    expect(tailnetAllowed(local({ "tailscale-funnel-request": "?1" }))).toBe(false);
    expect(tailnetAllowed(req(`http://${TS}/`, { host: TS, "tailscale-funnel-request": "?1", "tailscale-user-login": "owner@example.com" }))).toBe(false);
  });
  it("a non-loopback forwarded host marks the request as proxied", () => {
    expect(tailnetAllowed(local({ "x-forwarded-host": TS }))).toBe(false);
  });
});

describe("runtime path safety resolves links", () => {
  it("rejects a junction/symlink that points into a cloud-synced folder or the repo", () => {
    const synced = path.join(dir, "Cloud"); mkdirSync(synced);
    const repo = path.join(dir, "repo"); mkdirSync(repo);
    const env = penv({ OneDrive: synced });
    const link = path.join(dir, "innocent-home");
    symlinkSync(path.join(synced, "x"), link, process.platform === "win32" ? "junction" : "dir");
    mkdirSync(path.join(synced, "x"));
    expect(realLocation(path.join(link, "data", "baseline.db")).toLowerCase()).toContain(path.join("cloud", "x", "data").toLowerCase());
    expect(() => assertSafeLocation(path.join(link, "data", "baseline.db"), { env, repoRoot: repo })).toThrow(UnsafePathError);
    const repoLink = path.join(dir, "repo-link");
    symlinkSync(repo, repoLink, process.platform === "win32" ? "junction" : "dir");
    expect(() => assertSafeLocation(path.join(repoLink, "config.env"), { env: penv({}), repoRoot: repo })).toThrow(UnsafePathError);
    expect(() => assertSafeLocation(path.join(dir, "safe", "baseline.db"), { env, repoRoot: repo })).not.toThrow();
  });
});

describe("repo-local env secrets", () => {
  it("detects secrets in every env file Next.js loads", () => {
    writeFileSync(path.join(dir, ".env.production"), "SESSION_SECRET=fictional\n");
    writeFileSync(path.join(dir, ".env.test.local"), "HEVY_API_KEY=fictional\n");
    writeFileSync(path.join(dir, ".env.example"), "SESSION_SECRET=fictional\n"); // examples are not loaded
    expect(secretsInRepoEnvFiles(dir).sort()).toEqual([".env.production:SESSION_SECRET", ".env.test.local:HEVY_API_KEY"]);
  });
  it("refuses to start (env() throws) when they exist", async () => {
    writeFileSync(path.join(dir, ".env.local"), "ENCRYPTION_KEY=fictional\n");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      vi.resetModules();
      const { env } = await import("@/server/env");
      expect(() => env()).toThrow(/Refusing to start/);
    } finally { cwd.mockRestore(); }
  });
});
