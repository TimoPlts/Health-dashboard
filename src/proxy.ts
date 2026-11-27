import { NextResponse, type NextRequest } from "next/server";
import { createSessionValue, SESSION_COOKIE, SESSION_TTL_MS, shouldRenewSession, verifySessionValue } from "./server/session";
import { tailnetAllowed, viaHttps } from "./server/request";
import { loadRuntimeConfig } from "./server/runtime-home";
import { sessionRevocation } from "./server/auth-state";

// Proxy runs on the Node.js runtime (Next 16 default), so it can read <BASELINE_HOME>/config.env.
loadRuntimeConfig();

/**
 * Every page and API route requires a valid session, except the login page/endpoint and static assets.
 * Route handlers re-check the session (defence in depth; proxy is an optimistic check per Next.js guidance).
 */
const PUBLIC_PATHS = /^\/(login|api\/auth\/login|api\/health)(\/|$)/;

export async function proxy(req: NextRequest) {
  loadRuntimeConfig(); // cheap stat; picks up `npm run configure` changes (e.g. tailscale) without a restart
  if (!tailnetAllowed(req)) return new NextResponse("Not available", { status: 403, headers: { "cache-control": "no-store" } });
  if (PUBLIC_PATHS.test(req.nextUrl.pathname)) return NextResponse.next();
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionValue(value, process.env.SESSION_SECRET, Date.now(), sessionRevocation());
  if (ok) {
    const res = NextResponse.next();
    // Sliding 30-day session: the installed iPhone app stays signed in while it is used at least every two weeks.
    if (value && shouldRenewSession(value)) {
      res.cookies.set(SESSION_COOKIE, await createSessionValue(process.env.SESSION_SECRET!), {
        httpOnly: true, sameSite: "lax", secure: viaHttps(req), path: "/", maxAge: SESSION_TTL_MS / 1000,
      });
    }
    return res;
  }
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except hashed build assets and icons: the tailnet gate also covers /login and /api/health.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)"],
};
