import Database from "better-sqlite3";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { DB } from "../db/client";
import { ensureSafeDir, runtimePaths } from "../runtime-home";

/**
 * Database backups in <BASELINE_HOME>/backups (outside OneDrive and Git; user-only ACL).
 * File name: baseline-<UTC timestamp>-<kind>.db, kind = auto | manual | pre-restore.
 * Uses SQLite's online backup API, so a backup is consistent while the server keeps running.
 * Backups contain health data in plain SQLite and provider tokens encrypted with ENCRYPTION_KEY (config.env).
 */
export type BackupKind = "auto" | "manual" | "pre-restore";
export interface BackupInfo { file: string; name: string; kind: BackupKind | "other"; createdAt: number; bytes: number }

const NAME = /^baseline-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z)(?:-(auto|manual|pre-restore))?\.db$/;
const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, "-");
const parseStamp = (s: string) => Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z$/, (_, a, b, c, ms) => `${a}:${b}:${c}${ms ? `.${ms}` : ""}Z`));

export function backupDir(home = runtimePaths().home) {
  return ensureSafeDir(path.join(home, "backups"));
}

export async function createBackup(db: DB, kind: BackupKind, dir = backupDir()): Promise<BackupInfo> {
  const name = `baseline-${stamp()}-${kind}.db`;
  const file = path.join(dir, name);
  await db.$client.backup(file);
  return { file, name, kind, createdAt: Date.now(), bytes: statSync(file).size };
}

export function listBackups(dir = backupDir()): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name): BackupInfo[] => {
    const m = NAME.exec(name);
    if (!m) return [];
    const file = path.join(dir, name);
    return [{ file, name, kind: (m[2] as BackupKind | undefined) ?? "other", createdAt: parseStamp(m[1]!) || statSync(file).mtimeMs, bytes: statSync(file).size }];
  }).sort((a, b) => b.createdAt - a.createdAt);
}

/** Keep the newest `keep` automatic backups. Manual and pre-restore backups are never pruned automatically. */
export function pruneAutoBackups(keep: number, dir = backupDir()): number {
  const autos = listBackups(dir).filter((b) => b.kind === "auto");
  let removed = 0;
  for (const b of autos.slice(Math.max(0, keep))) { try { unlinkSync(b.file); removed++; } catch { /* in use */ } }
  return removed;
}

/** Daily automatic backup: creates one if the newest automatic backup is older than 24 h. */
export async function autoBackupIfDue(db: DB, keep: number, now = Date.now(), dir = backupDir()): Promise<BackupInfo | null> {
  if (keep <= 0) return null;
  const last = listBackups(dir).find((b) => b.kind === "auto");
  if (last && now - last.createdAt < 24 * 3_600_000) return null;
  const b = await createBackup(db, "auto", dir);
  pruneAutoBackups(keep, dir);
  return b;
}

const REQUIRED_TABLES = ["heart_rate_samples", "observations", "daily_metrics", "sleep_sessions", "exercise_sessions", "sync_state", "__drizzle_migrations"];

/**
 * Checks a backup before it is restored: SQLite integrity, Baseline's tables present, row counts.
 * Returns counts only (no values).
 */
export function verifyBackup(file: string): { ok: boolean; problems: string[]; counts: Record<string, number> } {
  const problems: string[] = [];
  const counts: Record<string, number> = {};
  let b: Database.Database | null = null;
  try {
    b = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = b.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") problems.push(`integrity_check: ${String(integrity).slice(0, 120)}`);
    const tables = new Set((b.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((r) => r.name));
    for (const t of REQUIRED_TABLES) if (!tables.has(t)) problems.push(`missing table ${t}`);
    for (const t of ["heart_rate_samples", "observations", "daily_metrics", "sleep_sessions", "exercise_sessions"]) {
      if (tables.has(t)) counts[t] = (b.prepare(`select count(*) as n from ${t}`).get() as { n: number }).n;
    }
  } catch (e) {
    problems.push((e as Error).message.slice(0, 200));
  } finally { b?.close(); }
  return { ok: problems.length === 0, problems, counts };
}
