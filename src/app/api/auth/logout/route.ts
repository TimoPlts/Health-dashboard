import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { SESSION_COOKIE, sessionClaims, verifySessionValue } from "@/server/session";
import { sameOrigin } from "@/server/request";
import { revokeSession, sessionRevocation } from "@/server/auth-state";

/**
 * Logout: revokes this session server-side (a copied cookie stops working immediately), then clears the cookie.
 * Same-origin only, so another site cannot sign the owner out.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (value && (await verifySessionValue(value, env().SESSION_SECRET, Date.now(), sessionRevocation()))) {
    const c = sessionClaims(value);
    if (c) revokeSession(c.id, c.expiresAt);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
