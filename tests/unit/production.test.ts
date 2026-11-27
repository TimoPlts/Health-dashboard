import { describe, expect, it } from "vitest";
import { isLoopbackHost, sameOrigin, tailnetAllowed, viaHttps } from "@/server/request";
import { createSessionValue, SESSION_TTL_MS, shouldRenewSession, verifySessionValue } from "@/server/session";

// FICTIONAL host and logins.
const TS = "baseline-pc.example-tailnet.ts.net";
const PUBLIC = `https://${TS}`;
const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { method: "POST", headers });
// What Tailscale Serve delivers (verified shape): Host preserved, identity headers added. Next adds x-forwarded-* too.
const viaServe = (extra: Record<string, string> = {}) =>
  req(`http://${TS}/api/sync`, { host: TS, "x-forwarded-host": TS, "x-forwarded-for": "100.64.0.2", "x-forwarded-proto": "http", "tailscale-user-login": "owner@example.com", ...extra });
// What a browser on this PC delivers (Next fills x-forwarded-* itself).
const local = (extra: Record<string, string> = {}) =>
  req("http://127.0.0.1:3000/api/sync", { host: "127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-proto": "http", "x-forwarded-for": "127.0.0.1", ...extra });

describe("Tailscale Serve: HTTPS detection", () => {
  it("a request for the https PUBLIC_URL host is HTTPS even when x-forwarded-proto says http", () => {
    expect(viaHttps(viaServe(), PUBLIC)).toBe(true);
    expect(viaHttps(local(), PUBLIC)).toBe(false);
    expect(viaHttps(viaServe(), undefined)).toBe(false); // not configured → not assumed
    expect(viaHttps(local({ "x-forwarded-proto": "https" }), undefined)).toBe(true);
  });
});

describe("Tailscale Serve: tailnet gate", () => {
  it("loopback requests pass; forwarded requests need a tailnet identity", () => {
    expect(tailnetAllowed(local())).toBe(true);
    expect(tailnetAllowed(viaServe())).toBe(true);
    const { "tailscale-user-login": _, ...noLogin } = Object.fromEntries(viaServe().headers);
    expect(tailnetAllowed(req(`http://${TS}/`, noLogin))).toBe(false); // e.g. Funnel
    expect(tailnetAllowed(viaServe({ "tailscale-funnel-request": "?1" }))).toBe(false);
  });
  it("TAILNET_ALLOWED_LOGINS restricts to listed users (case-insensitive)", () => {
    expect(tailnetAllowed(viaServe(), "Owner@Example.com")).toBe(true);
    expect(tailnetAllowed(viaServe(), "someone@example.com, other@example.com")).toBe(false);
  });
  it("recognises loopback hosts only", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"]) expect(isLoopbackHost(h)).toBe(true);
    for (const h of [TS, "192.168.1.5:3000", "100.64.0.1", "localhost.evil.example"]) expect(isLoopbackHost(h)).toBe(false);
  });
});

describe("CSRF same-origin check", () => {
  it("compares the Origin with the Host the browser addressed", () => {
    expect(sameOrigin(viaServe({ origin: PUBLIC }))).toBe(true);
    expect(sameOrigin(local({ origin: "http://127.0.0.1:3000" }))).toBe(true);
    expect(sameOrigin(viaServe({ origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(viaServe({ origin: "null" }))).toBe(false);
    expect(sameOrigin(viaServe())).toBe(true); // no Origin: non-browser client, session still required
  });
});

describe("sliding sessions", () => {
  it("re-issues a valid session only in the second half of its lifetime", async () => {
    const now = Date.UTC(2026, 10, 1);
    const v = await createSessionValue("test-secret-not-real", now);
    expect(await verifySessionValue(v, "test-secret-not-real", now)).toBe(true);
    expect(shouldRenewSession(v, now + 1000)).toBe(false);
    expect(shouldRenewSession(v, now + SESSION_TTL_MS / 2 + 1000)).toBe(true);
    expect(await verifySessionValue(v, "test-secret-not-real", now + SESSION_TTL_MS + 1)).toBe(false);
  });
});
