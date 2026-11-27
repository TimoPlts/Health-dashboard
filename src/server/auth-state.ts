import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureSafeDir, runtimePaths } from "./runtime-home";
import type { RevocationCheck } from "./session";

/**
 * Persistent authentication state in <BASELINE_HOME>/auth-state.json (outside the repo and OneDrive, user-only ACL):
 *  - revoked session ids (logout) until their expiry, and `revokedBefore` (app password changed → all sessions end);
 *  - recent failed login attempts, so the login brake survives a server restart.
 * Contains no secrets: random session ids and timestamps only. Node.js runtime only (proxy.ts runs on Node in Next 16).
 *
 * Fail closed: an unreadable or corrupt file is replaced by a fresh state whose `revokedBefore` is "now", which ends
 * every existing session (the owner signs in again) instead of silently accepting revoked ones.
 */
export interface AuthState {
  revokedBefore: number;
  revoked: Record<string, number>; // session id → its expiry (ms); pruned after expiry
  failures: number[]; // failed login/password attempts (ms)
}

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES = 10;
const MAX_REVOKED = 1000;

export const authStateFile = (home = runtimePaths().home) => path.join(home, "auth-state.json");

let cache: { file: string; mtimeMs: number; state: AuthState } | null = null;

function parse(text: string): AuthState | null {
  try {
    const j = JSON.parse(text) as Partial<AuthState>;
    if (typeof j.revokedBefore !== "number" || !Number.isFinite(j.revokedBefore)) return null;
    const revoked: Record<string, number> = {};
    for (const [k, v] of Object.entries(j.revoked ?? {})) if (typeof v === "number") revoked[k] = v;
    const failures = Array.isArray(j.failures) ? j.failures.filter((x): x is number => typeof x === "number") : [];
    return { revokedBefore: j.revokedBefore, revoked, failures };
  } catch {
    return null;
  }
}

export function readAuthState(file = authStateFile(), now = Date.now()): AuthState {
  if (!existsSync(file)) return { revokedBefore: 0, revoked: {}, failures: [] };
  let mtimeMs: number;
  try { mtimeMs = statSync(file).mtimeMs; } catch { return { revokedBefore: now, revoked: {}, failures: [] }; }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.state;
  let state: AuthState | null = null;
  try { state = parse(readFileSync(file, "utf8")); } catch { state = null; }
  if (!state) {
    state = { revokedBefore: now, revoked: {}, failures: [] }; // corrupt → fail closed
    writeAuthState(state, file);
    return state;
  }
  cache = { file, mtimeMs, state };
  return state;
}

export function writeAuthState(state: AuthState, file = authStateFile(), now = Date.now()) {
  ensureSafeDir(path.dirname(file));
  const revoked = Object.entries(state.revoked).filter(([, exp]) => exp > now).sort((a, b) => b[1] - a[1]).slice(0, MAX_REVOKED);
  const clean: AuthState = {
    revokedBefore: state.revokedBefore,
    revoked: Object.fromEntries(revoked),
    failures: state.failures.filter((t) => t > now - LOGIN_WINDOW_MS).slice(-100),
  };
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(clean), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  cache = null;
}

function update(fn: (s: AuthState) => void, file = authStateFile(), now = Date.now()) {
  const s = structuredClone(readAuthState(file, now));
  fn(s);
  writeAuthState(s, file, now);
}

/** Revocation check for verifySessionValue. */
export function sessionRevocation(file = authStateFile(), now = Date.now()): RevocationCheck {
  const s = readAuthState(file, now);
  return { revokedBefore: s.revokedBefore, isRevoked: (id) => id in s.revoked };
}

/** Logout: this session id is rejected from now on. */
export function revokeSession(id: string, expiresAt: number, file = authStateFile(), now = Date.now()) {
  update((s) => { s.revoked[id] = expiresAt; }, file, now);
}

/** App password changed (or "sign out everywhere"): every session issued before `now` is rejected. */
export function revokeAllSessions(file = authStateFile(), now = Date.now()) {
  update((s) => { s.revokedBefore = now; s.revoked = {}; }, file, now);
}

/** Login brake: true while LOGIN_MAX_FAILURES failures happened within LOGIN_WINDOW_MS. Survives restarts. */
export function loginLocked(file = authStateFile(), now = Date.now()): boolean {
  return readAuthState(file, now).failures.filter((t) => t > now - LOGIN_WINDOW_MS).length >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(file = authStateFile(), now = Date.now()) {
  update((s) => { s.failures.push(now); }, file, now);
}

export function clearLoginFailures(file = authStateFile(), now = Date.now()) {
  if (readAuthState(file, now).failures.length) update((s) => { s.failures = []; }, file, now);
}
