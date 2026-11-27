import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. The app loads nothing from other origins (fonts are self-hosted by next/font), so
 * everything is 'self'. connect-src 'self' means injected script could not send data anywhere else.
 * 'unsafe-inline' for scripts is required by Next.js' inline bootstrap scripts without per-request nonces (which
 * would force every page to render dynamically); 'unsafe-eval' and ws: are only added for the dev server (HMR).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  // Native module; must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  // Dev logs are mirrored to .next/dev/logs inside the (OneDrive-synced) repo. Request URLs can carry
  // OAuth codes, and browser logs could carry values — keep both out of the logs.
  logging: { incomingRequests: false, browserToTerminal: false, fetches: { fullUrl: false } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Only honoured over HTTPS (Tailscale Serve); browsers ignore it on http://localhost.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      {
        // Health data must never be stored by the browser, the iOS web-app cache or any proxy.
        // Hashed build assets (/_next/static) and the icons stay cacheable; they contain no personal data.
        source: "/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
