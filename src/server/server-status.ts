import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "./env";
import { runtimePaths } from "./runtime-home";

/** What the Settings page shows about the running server. No health data. */
export function serverStatus() {
  let sup: { supervisorPid?: number; restarts?: number; lastExit?: { at: number; code: number | null } | null } | null = null;
  try { sup = JSON.parse(readFileSync(path.join(runtimePaths().home, "server-status.json"), "utf8")); } catch { sup = null; }
  const alive = (pid?: number) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
  const production = process.env.NODE_ENV === "production";
  return {
    mode: production ? "Production" : "Development",
    supervised: production && alive(sup?.supervisorPid),
    startedAt: Date.now() - Math.round(process.uptime() * 1000),
    restarts: sup?.restarts ?? 0,
    lastCrashAt: sup?.lastExit && sup.lastExit.code !== 0 ? sup.lastExit.at : null,
    publicUrl: env().PUBLIC_URL ?? null,
  };
}
