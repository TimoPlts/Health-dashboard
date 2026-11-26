/**
 * Single-user session: an HMAC-SHA256 signed cookie "<expiresAtMs>.<signature>".
 * Uses Web Crypto only, so it runs both in proxy.ts and route handlers.
 */
export const SESSION_COOKIE = "hs_session";
export const SESSION_TTL_MS = 30 * 86_400_000;

const enc = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function createSessionValue(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_TTL_MS);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`session:${exp}`));
  return `${exp}.${b64url(sig)}`;
}

/** Expiry (ms) encoded in a session value, without verifying it. Use only after verifySessionValue succeeded. */
export function sessionExpiresAt(value: string): number | null {
  const exp = value.split(".")[0];
  return exp && /^\d+$/.test(exp) ? Number(exp) : null;
}

/** Sliding sessions: a valid session with less than half its lifetime left is re-issued on the next request. */
export const shouldRenewSession = (value: string, now = Date.now()) => {
  const exp = sessionExpiresAt(value);
  return exp !== null && exp - now < SESSION_TTL_MS / 2;
};

export async function verifySessionValue(value: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !secret) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(`session:${exp}`));
  } catch {
    return false;
  }
}
