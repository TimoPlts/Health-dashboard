import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "./server/session";
import { loadRuntimeConfig } from "./server/runtime-home";

// Proxy runs on the Node.js runtime (Next 16 default), so it can read <BASELINE_HOME>/config.env.
loadRuntimeConfig();

/**
 * Every page and API route requires a valid session, except the login page/endpoint and static assets.
 * Route handlers re-check the session (defence in depth; proxy is an optimistic check per Next.js guidance).
 */
export async function proxy(req: NextRequest) {
  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/auth/login|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)"],
};
