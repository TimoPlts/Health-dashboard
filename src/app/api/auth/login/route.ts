import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { verifyPassword } from "@/server/crypto";
import { createSessionValue, SESSION_COOKIE, SESSION_TTL_MS } from "@/server/session";
import { sameOrigin, viaHttps } from "@/server/request";
import { clearLoginFailures, loginLocked, recordLoginFailure } from "@/server/auth-state";

/**
 * Password login. Brute-force brake: 10 failures within 15 minutes lock the login for the rest of that window.
 * Failures are stored in <BASELINE_HOME>/auth-state.json, so restarting the server does not reset the brake.
 */
export async function POST(req: Request) {
  const e = env();
  if (!e.APP_PASSWORD_HASH || !e.SESSION_SECRET) {
    return NextResponse.json({ error: "App password is not configured. Run `npm run configure` (see README)." }, { status: 503 });
  }
  if (!sameOrigin(req)) return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
  if (loginLocked()) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const password = form?.get("password");
  if (typeof password !== "string" || password.length > 1000 || !verifyPassword(password, e.APP_PASSWORD_HASH)) {
    recordLoginFailure();
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  clearLoginFailures();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionValue(e.SESSION_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: viaHttps(req) || e.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
