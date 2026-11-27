/**
 * Request helpers for running behind Tailscale Serve. Runs in proxy.ts and route handlers (Web APIs only).
 *
 * Verified on this machine (tailscale 1.102): Serve PRESERVES the browser's Host header and adds X-Forwarded-Host,
 * X-Forwarded-For and the tailnet identity headers (Tailscale-User-Login, …), which Tailscale sets itself.
 * Next.js also fills X-Forwarded-* on every request when they are missing, so the presence of those headers says
 * nothing. The reliable signal is the Host: the server listens on 127.0.0.1 only, so a non-loopback Host can only
 * arrive through Serve (or a local process, which already has access to the machine).
 */

const hostOf = (req: Request) => (req.headers.get("host") ?? new URL(req.url).host).split(",")[0]!.trim().toLowerCase();
const hostname = (host: string) => (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!);

export function isLoopbackHost(host: string): boolean {
  const h = hostname(host.toLowerCase());
  return h === "localhost" || h === "[::1]" || h.startsWith("127.");
}

/**
 * True when the browser used HTTPS: the request is for the configured https PUBLIC_URL host (Tailscale Serve
 * terminates TLS there), or arrived over TLS directly, or a proxy said so.
 */
export function viaHttps(req: Request, publicUrl = process.env.PUBLIC_URL): boolean {
  if (publicUrl?.startsWith("https://")) {
    try { if (hostOf(req) === new URL(publicUrl).host.toLowerCase()) return true; } catch { /* invalid PUBLIC_URL */ }
  }
  if (new URL(req.url).protocol === "https:") return true;
  return req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() === "https";
}

const LOOPBACK_ADDR = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+|\[::1\]|localhost)$/i;

/**
 * True when anything about the request says it was forwarded by a proxy (Tailscale Serve/Funnel) rather than sent by
 * a browser or process on this PC. Next.js only fills X-Forwarded-For/-Host when they are MISSING (`??=`), so a direct
 * local request carries the loopback socket address and its own Host, while Serve sets the tailnet client's address
 * and the browser's Host. The Host header alone is client-controlled and is never trusted on its own.
 */
export function viaProxy(req: Request): boolean {
  const h = req.headers;
  if (h.has("tailscale-funnel-request") || h.has("tailscale-user-login")) return true;
  const xff = h.get("x-forwarded-for");
  if (xff && xff.split(",").some((a) => !LOOPBACK_ADDR.test(a.trim()))) return true;
  const xfh = h.get("x-forwarded-host");
  if (xfh && xfh.split(",").some((x) => !isLoopbackHost(x.trim()))) return true;
  return false;
}

/**
 * Gate in front of everything (before the app password). Fails closed:
 *  - Tailscale Funnel (public internet) traffic is always refused;
 *  - a request with no sign of a proxy AND a loopback Host (this PC's browser, the supervisor, CLI): allowed;
 *  - anything else came through Tailscale Serve and must carry a tailnet identity (Tailscale sets these headers
 *    itself and strips client-supplied copies). A forged `Host: localhost` through Serve does not bypass this;
 *  - TAILNET_ALLOWED_LOGINS (comma-separated) optionally restricts access to specific tailnet users.
 */
export function tailnetAllowed(req: Request, allowedLogins = process.env.TAILNET_ALLOWED_LOGINS): boolean {
  if (req.headers.has("tailscale-funnel-request")) return false;
  if (!viaProxy(req) && isLoopbackHost(hostOf(req))) return true;
  const login = req.headers.get("tailscale-user-login")?.trim().toLowerCase();
  if (!login) return false;
  const allowed = (allowedLogins ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(login);
}

/**
 * Same-origin check for state-changing requests (CSRF defence on top of SameSite=Lax): the browser's Origin host
 * must equal the Host it addressed. No Origin header (non-browser clients) is allowed; the session is still required.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host.toLowerCase() === hostOf(req); } catch { return false; }
}
