import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;
