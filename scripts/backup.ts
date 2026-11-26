/**
 * Consistent online backup of the health database into <BASELINE_HOME>/backups (outside OneDrive).
 *   npm run backup
 */
import "./_env";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../src/server/env";
import { ensureSafeDir, runtimePaths } from "../src/server/runtime-home";

const dir = ensureSafeDir(runtimePaths().backups);
const target = path.join(dir, `baseline-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
const db = new Database(env().DATABASE_PATH, { readonly: true });
await db.backup(target);
db.close();
console.log(`Backup written to ${target}`);
console.log("Remember: backups are only useful together with ENCRYPTION_KEY from config.env (keep a copy in your password manager).");
