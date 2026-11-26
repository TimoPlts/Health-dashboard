import { existsSync } from "node:fs";

/** Load .env.local / .env for CLI scripts (Next.js does this itself for the web app). */
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
