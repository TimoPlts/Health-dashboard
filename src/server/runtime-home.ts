import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Baseline keeps ALL sensitive runtime data (secrets, database, backups, exports, probe reports)
 * in a private per-user directory OUTSIDE the repository and outside any cloud-synced folder:
 *
 *   Windows: %LOCALAPPDATA%\Baseline          (not synced by OneDrive; user-only ACL inherited)
 *   macOS:   ~/Library/Application Support/Baseline
 *   Linux:   $XDG_DATA_HOME/baseline or ~/.local/share/baseline
 *
 * Override with BASELINE_HOME (e.g. on a future always-on server). See docs/SECURITY.md.
 * This module has no Next.js dependencies so CLI scripts, proxy.ts and route handlers can all use it.
 */

export function baselineHome(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.BASELINE_HOME) return path.resolve(env.BASELINE_HOME);
  if (platform === "win32") return path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Baseline");
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Baseline");
  return path.join(env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "baseline");
}

export function runtimePaths(home = baselineHome()) {
  return {
    home,
    configFile: path.join(home, "config.env"),
    dataDir: path.join(home, "data"),
    database: path.join(home, "data", "baseline.db"),
    backups: path.join(home, "backups"),
    exports: path.join(home, "exports"),
    probeOutput: path.join(home, "probe-output"),
    logs: path.join(home, "logs"),
  };
}

/** Folders that sync to the cloud on this machine (OneDrive variants; Dropbox/Google Drive by name). */
export function syncedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.OneDrive, env.OneDriveCommercial, env.OneDriveConsumer].filter((x): x is string => Boolean(x)).map((p) => path.resolve(p));
}

const norm = (p: string) => path.resolve(p).toLowerCase().replace(/[\\/]+$/, "");
const isInside = (child: string, parent: string) => {
  const c = norm(child), p = norm(parent);
  return c === p || c.startsWith(p + path.sep.toLowerCase()) || c.startsWith(p + "/");
};

export class UnsafePathError extends Error {}

/**
 * Throws if `target` is inside a cloud-synced folder or inside the repository.
 * Called before any sensitive file (DB, config, backup, export) is opened or written.
 */
export function assertSafeLocation(target: string, opts: { repoRoot?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const env = opts.env ?? process.env;
  const repo = opts.repoRoot ?? process.cwd();
  for (const root of syncedRoots(env)) {
    if (isInside(target, root)) throw new UnsafePathError(`Refusing to store sensitive data inside a cloud-synced folder: ${target} (synced root ${root}). Set BASELINE_HOME to a local, non-synced directory.`);
  }
  if (/[\\/](onedrive|dropbox|google drive|icloud ?drive)[^\\/]*[\\/]/i.test(target + path.sep)) {
    throw new UnsafePathError(`Refusing to store sensitive data in what looks like a cloud-synced folder: ${target}`);
  }
  if (isInside(target, repo)) throw new UnsafePathError(`Refusing to store sensitive data inside the repository: ${target}`);
}

/** Minimal dotenv parser: KEY=VALUE lines, # comments, optional surrounding quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/^[A-Z0-9_]+$/i.test(key)) out[key] = value;
  }
  return out;
}

let loaded = false;

/**
 * Load <BASELINE_HOME>/config.env into process.env once. Real environment variables win, so a
 * future server can inject secrets via its own mechanism instead of the file.
 */
export function loadRuntimeConfig(): { configFile: string; found: boolean } {
  const { configFile } = runtimePaths();
  if (loaded) return { configFile, found: existsSync(configFile) };
  loaded = true;
  if (!existsSync(configFile)) return { configFile, found: false };
  for (const [k, v] of Object.entries(parseEnvFile(readFileSync(configFile, "utf8")))) {
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  }
  return { configFile, found: true };
}

/** Create a runtime sub-directory after verifying it is safe. */
export function ensureSafeDir(dir: string): string {
  assertSafeLocation(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Secret keys that must never live in a repo-local .env file. */
export const SECRET_KEYS = ["APP_PASSWORD_HASH", "SESSION_SECRET", "ENCRYPTION_KEY", "GOOGLE_CLIENT_SECRET", "HEVY_API_KEY"] as const;

/** Names of secret keys present in repo-local .env files (which Next.js would load). */
export function secretsInRepoEnvFiles(repoRoot = process.cwd()): string[] {
  const found: string[] = [];
  for (const f of [".env", ".env.local", ".env.development.local", ".env.production.local"]) {
    const p = path.join(repoRoot, f);
    if (!existsSync(p)) continue;
    const vars = parseEnvFile(readFileSync(p, "utf8"));
    for (const k of SECRET_KEYS) if (vars[k]) found.push(`${f}:${k}`);
  }
  return found;
}
