import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env, isDemoMode } from "../env";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");

/** Open a database and apply pending migrations. `":memory:"` is supported for tests. */
export function openDatabase(file: string): DB {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

const g = globalThis as unknown as { __healthDb?: DB };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function db(): DB {
  if (!g.__healthDb) {
    // Demo DB holds only fictional data and may live in the repo (git-ignored). The real DB path is
    // validated in env() to be outside OneDrive and the repository.
    const file = isDemoMode() ? "./data/demo.db" : env().DATABASE_PATH;
    g.__healthDb = openDatabase(file);
  }
  return g.__healthDb;
}
