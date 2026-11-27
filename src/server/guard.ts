import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "./env";
import { SESSION_COOKIE, verifySessionValue } from "./session";
import { sameOrigin } from "./request";
import { sessionRevocation } from "./auth-state";

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionValue(jar.get(SESSION_COOKIE)?.value, env().SESSION_SECRET, Date.now(), sessionRevocation());
}

/**
 * For state-changing route handlers: valid session + same-origin request (CSRF defence on top of SameSite=Lax).
 * Returns an error response, or null when the request may proceed.
 */
export async function guardMutation(req: Request): Promise<NextResponse | null> {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
  }
  return null;
}
