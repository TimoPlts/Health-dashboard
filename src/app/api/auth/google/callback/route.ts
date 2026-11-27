import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { decryptSecret } from "@/server/crypto";
import { env, requireSecret } from "@/server/env";
import { isAuthenticated } from "@/server/guard";
import { db } from "@/server/db/client";
import { googleOAuthConfig, saveGoogleTokens } from "@/server/connections";
import { exchangeCode } from "@/server/providers/google/oauth";
import { GoogleHealthClient } from "@/server/providers/google/client";
import { HttpError } from "@/server/http";
import { syncAll } from "@/server/sync/run";

const OAUTH_TX_COOKIE = "hs_oauth_tx";

export async function GET(req: NextRequest) {
  const base = env().APP_BASE_URL;
  const fail = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(msg)}`, base));
    res.cookies.delete({ name: OAUTH_TX_COOKIE, path: "/api/auth/google" });
    return res;
  };
  if (!(await isAuthenticated())) return fail("Session expired — log in and try again.");

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fail(`Google returned: ${p.get("error")}`);
  const code = p.get("code"), state = p.get("state");
  const txRaw = req.cookies.get(OAUTH_TX_COOKIE)?.value;
  if (!code || !state || !txRaw) return fail("Missing OAuth parameters — start the connection again.");

  let tx: { state: string; verifier: string; t: number };
  try {
    tx = JSON.parse(decryptSecret(txRaw, requireSecret("ENCRYPTION_KEY")));
  } catch {
    return fail("Invalid OAuth transaction.");
  }
  const a = Buffer.from(tx.state), b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b) || Date.now() - tx.t > 600_000) return fail("OAuth state mismatch or expired.");

  try {
    const tokens = await exchangeCode(googleOAuthConfig(), code, tx.verifier);
    if (!tokens.refreshToken) return fail("Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and reconnect.");
    // Verify the account is linked to Google Health before storing (unlinked → 400 ACCOUNT_NOT_LINKED).
    const identity = await new GoogleHealthClient(async () => tokens.accessToken).getIdentity();
    const userId = String(identity.healthUserId ?? identity.name ?? "");
    saveGoogleTokens(db(), tokens, userId || undefined);
  } catch (e) {
    if (e instanceof HttpError && e.bodySnippet.includes("ACCOUNT_NOT_LINKED")) {
      return fail("Your Google account is not linked to Google Health yet. Sign in to the Google Health app on your phone first.");
    }
    return fail(e instanceof Error ? e.message.slice(0, 200) : "Token exchange failed");
  }

  // Start the initial backfill in the background; the Settings page shows progress.
  void syncAll(db(), "connect").catch(() => {});
  const res = NextResponse.redirect(new URL("/settings?connected=google", base));
  res.cookies.delete({ name: OAUTH_TX_COOKIE, path: "/api/auth/google" });
  return res;
}
