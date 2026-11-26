import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { encryptSecret } from "@/server/crypto";
import { env, requireSecret } from "@/server/env";
import { isAuthenticated } from "@/server/guard";
import { googleOAuthConfig } from "@/server/connections";
import { buildAuthorizationUrl, createPkcePair } from "@/server/providers/google/oauth";

const OAUTH_TX_COOKIE = "hs_oauth_tx";

/** Starts the Google OAuth flow (Authorization Code + PKCE). State and verifier live in an encrypted, short-lived cookie. */
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let cfg;
  try {
    cfg = googleOAuthConfig();
  } catch (e) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent((e as Error).message)}`, env().APP_BASE_URL));
  }
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = createPkcePair();
  const res = NextResponse.redirect(buildAuthorizationUrl(cfg, state, challenge));
  res.cookies.set(OAUTH_TX_COOKIE, encryptSecret(JSON.stringify({ state, verifier, t: Date.now() }), requireSecret("ENCRYPTION_KEY")), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_BASE_URL.startsWith("https://"),
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
