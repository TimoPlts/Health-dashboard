/**
 * Data ownership on this PC. Everything stays in BASELINE_HOME (outside OneDrive and Git).
 *
 *   npm run data -- backup              back up now (npm run backup does the same)
 *   npm run data -- list                list backups
 *   npm run data -- verify <backup>     integrity check + row counts of a backup
 *   npm run data -- restore <backup>    stop the service, keep a safety copy, restore, start again
 *   npm run data -- export              full CSV export into BASELINE_HOME\exports
 *   npm run data -- retention           apply retention now (normally after every sync)
 *   npm run data -- delete-all          revoke Google, erase all data, backups, exports and logs
 * <backup> is a file name from `list` or a path. Prints counts and file names only, never health values.
 */
import "./_env";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";
import { offsetMs } from "../src/lib/time";
import { backupDir, createBackup, listBackups, verifyBackup } from "../src/server/data/backup";
import { exportAll } from "../src/server/data/export";
import { applyRetention } from "../src/server/data/retention";
import { deleteAllData } from "../src/server/data/delete";
import { disconnectProvider } from "../src/server/connections";
import { runtimePaths } from "../src/server/runtime-home";

const cmd = process.argv[2] ?? "help";
const arg = process.argv[3];
const yes = process.argv.includes("--yes");
const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

function ask(q: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    process.stdout.write(q);
    process.stdin.resume(); process.stdin.setEncoding("utf8");
    process.stdin.once("data", (d) => { process.stdin.pause(); resolve(String(d).trim()); });
  });
}
async function serverUp(port: number) {
  try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
const service = (c: string) => spawnSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/service.ts", c], { stdio: "inherit" });
function resolveBackup(a?: string) {
  if (!a) throw new Error("Name a backup (npm run data -- list).");
  const p = existsSync(a) ? path.resolve(a) : path.join(backupDir(), a);
  if (!existsSync(p)) throw new Error(`Backup not found: ${a}`);
  return p;
}

const dbPath = env().DATABASE_PATH;
const fb = Math.round(offsetMs(Date.now(), env().HOME_TIME_ZONE) / 1000);

switch (cmd) {
  case "backup": {
    const db = openDatabase(dbPath);
    const b = await createBackup(db, "manual");
    console.log(`✓ ${b.name} (${mb(b.bytes)}) in ${path.dirname(b.file)}`);
    console.log("  Backups hold health data unencrypted and provider tokens encrypted with ENCRYPTION_KEY (config.env).");
    break;
  }
  case "list": {
    const all = listBackups();
    if (!all.length) console.log("No backups yet.");
    for (const b of all) console.log(`${b.name.padEnd(52)} ${b.kind.padEnd(11)} ${mb(b.bytes).padStart(9)}  ${new Date(b.createdAt).toLocaleString()}`);
    break;
  }
  case "verify": {
    const v = verifyBackup(resolveBackup(arg));
    console.log(v.ok ? "✓ Backup is valid." : `✗ Problems: ${v.problems.join("; ")}`);
    for (const [t, n] of Object.entries(v.counts)) console.log(`  ${t.padEnd(20)} ${n} rows`);
    break;
  }
  case "restore": {
    const file = resolveBackup(arg);
    const v = verifyBackup(file);
    if (!v.ok) { console.log(`✗ Not restoring: ${v.problems.join("; ")}`); process.exit(1); }
    console.log(`Backup ${path.basename(file)}: ${Object.entries(v.counts).map(([t, n]) => `${t} ${n}`).join(", ")}`);
    if (await serverUp(3001)) { console.log("✗ A development server (port 3001) is using the database. Stop `npm run dev` first."); process.exit(1); }
    if (!yes && (await ask("This replaces your current database (a safety copy is kept). Type 'restore' to continue: ")) !== "restore") { console.log("Cancelled."); process.exit(0); }
    const wasRunning = await serverUp(3000);
    if (wasRunning) service("stop");
    if (await serverUp(3000)) { console.log("✗ The server on port 3000 is still running. Stop it and retry."); process.exit(1); }
    if (existsSync(dbPath)) {
      const cur = openDatabase(dbPath);
      const safety = await createBackup(cur, "pre-restore");
      cur.$client.close();
      console.log(`  Safety copy of the current database: ${safety.name}`);
    }
    for (const ext of ["", "-wal", "-shm"]) rmSync(`${dbPath}${ext}`, { force: true });
    copyFileSync(file, dbPath);
    openDatabase(dbPath).$client.close(); // applies migrations if the backup is from an older version
    console.log("✓ Restored.");
    if (wasRunning) service("start");
    break;
  }
  case "export": {
    const r = await exportAll(openDatabase(dbPath), fb);
    console.log(`✓ Exported ${Object.keys(r.counts).length} files to ${r.dir}`);
    for (const [t, n] of Object.entries(r.counts)) console.log(`  ${t.padEnd(26)} ${n} rows`);
    console.log("  The folder is deleted automatically after 7 days.");
    break;
  }
  case "retention": {
    console.log(applyRetention(openDatabase(dbPath)));
    break;
  }
  case "delete-all": {
    console.log("This permanently deletes ALL Baseline data on this PC: measurements, sleep, workouts, settings, backups, exports and logs,\nand revokes Baseline's access to your Google account. config.env (app password) is kept.");
    if (!yes && (await ask("Type 'DELETE ALL' to continue: ")) !== "DELETE ALL") { console.log("Cancelled."); process.exit(0); }
    const db = openDatabase(dbPath);
    const g = await disconnectProvider(db, "google");
    await disconnectProvider(db, "hevy");
    const r = deleteAllData(db, runtimePaths().home);
    console.log(`✓ Deleted ${r.rows} rows in ${r.tables} tables; files: ${JSON.stringify(r.files)}. Google access ${g.revoked ? "revoked" : "was not connected / could not be revoked (check myaccount.google.com/permissions)"}.`);
    console.log("  To remove Baseline completely: npm run service -- uninstall; npm run configure -- tailscale-off; delete %LOCALAPPDATA%\\Baseline.");
    break;
  }
  default:
    console.log("Usage: npm run data -- backup | list | verify <backup> | restore <backup> | export | retention | delete-all");
}
process.exit(0);
