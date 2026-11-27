/**
 * Single-user session: an HMAC-SHA256 signed cookie "s2.<issuedAtMs>.<expiresAtMs>.<id>.<signature>".
 * Uses Web Crypto only, so it runs both in proxy.ts and route handlers.
 *
 * Revocation (server-side, see auth-state.ts): logout revokes the session's random id; changing the app password
 * revokes every session issued before the change (`revokedBefore`). Cookies in the old "<exp>.<sig>" format are
 * rejected, so existing sessions end once when this version is deployed.
 */
export const SESSION_COOKIE = "hs_session";
export const SESSION_TTL_MS = 30 * 86_400_000;
const PREFIX = "s2";

const enc = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const payload = (iat: string, exp: string, id: string) => `session:${PREFIX}:${iat}:${exp}:${id}`;

export async function createSessionValue(secret: string, now = Date.now()): Promise<string> {
  const iat = String(now), exp = String(now + SESSION_TTL_MS);
  const id = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload(iat, exp, id)));
  return `${PREFIX}.${iat}.${exp}.${id}.${b64url(sig)}`;
}

export interface SessionClaims { id: string; issuedAt: number; expiresAt: number }

/** Parsed fields of a session value, WITHOUT verifying it. Use only after verifySessionValue succeeded. */
export function sessionClaims(value: string): SessionClaims | null {
  const [prefix, iat, exp, id] = value.split(".");
  if (prefix !== PREFIX || !iat || !exp || !id || !/^\d+$/.test(iat) || !/^\d+$/.test(exp) || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  return { id, issuedAt: Number(iat), expiresAt: Number(exp) };
}

/** Expiry (ms) encoded in a session value, without verifying it. Use only after verifySessionValue succeeded. */
export function sessionExpiresAt(value: string): number | null {
  return sessionClaims(value)?.expiresAt ?? null;
}

/** Sliding sessions: a valid session with less than half its lifetime left is re-issued on the next request. */
export const shouldRenewSession = (value: string, now = Date.now()) => {
  const exp = sessionExpiresAt(value);
  return exp !== null && exp - now < SESSION_TTL_MS / 2;
};

export interface RevocationCheck {
  /** Sessions issued before this time (ms) are invalid (set when the app password changes). */
  revokedBefore?: number;
  /** True when this session id was revoked (logout). */
  isRevoked?: (id: string) => boolean;
}

export async function verifySessionValue(value: string | undefined, secret: string | undefined, now = Date.now(), revocation: RevocationCheck = {}): Promise<boolean> {
  if (!value || !secret) return false;
  const parts = value.split(".");
  const c = sessionClaims(value);
  if (parts.length !== 5 || !c || !parts[4]) return false;
  if (c.expiresAt < now || c.issuedAt > now + 60_000 || c.expiresAt - c.issuedAt !== SESSION_TTL_MS) return false;
  if (revocation.revokedBefore !== undefined && c.issuedAt < revocation.revokedBefore) return false;
  if (revocation.isRevoked?.(c.id)) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(parts[4]), enc.encode(payload(parts[1]!, parts[2]!, c.id)));
  } catch {
    return false;
  }
}
