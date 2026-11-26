import { z } from "zod";
import { assertSafeLocation, loadRuntimeConfig, runtimePaths, secretsInRepoEnvFiles } from "./runtime-home";

/**
 * Server-side configuration.
 * Sources, highest priority first: real environment variables → <BASELINE_HOME>/config.env.
 * Secrets never live in the repository (see docs/SECURITY.md). Never import this from client components.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  HOME_TIME_ZONE: z.string().default("Europe/Brussels"),
  DATABASE_PATH: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  HEVY_API_KEY: z.string().optional(),
  DEMO_MODE: z.string().optional(),
  BACKFILL_DAYS: z.coerce.number().int().positive().max(3650).default(365),
});

export type Env = Omit<z.infer<typeof schema>, "DATABASE_PATH"> & { DATABASE_PATH: string };

let cached: Env | undefined;

export function env(): Env {
  // Cheap stat per call; picks up `npm run configure` changes without a restart.
  if (loadRuntimeConfig().changed) cached = undefined;
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  const empty = (v?: string) => (v && v.trim() !== "" ? v : undefined);
  const demo = empty(parsed.DEMO_MODE);
  const e: Env = {
    ...parsed,
    APP_PASSWORD_HASH: empty(parsed.APP_PASSWORD_HASH),
    SESSION_SECRET: empty(parsed.SESSION_SECRET),
    ENCRYPTION_KEY: empty(parsed.ENCRYPTION_KEY),
    GOOGLE_CLIENT_ID: empty(parsed.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: empty(parsed.GOOGLE_CLIENT_SECRET),
    HEVY_API_KEY: empty(parsed.HEVY_API_KEY),
    DEMO_MODE: demo,
    DATABASE_PATH: empty(parsed.DATABASE_PATH) ?? runtimePaths().database,
  };
  if (e.NODE_ENV === "production" && demo) {
    throw new Error("DEMO_MODE is not allowed in production. Fictional data must never be served as real data.");
  }
  if (!demo) {
    // The real health database must never sit in OneDrive or the repo. (Demo DB is fictional.)
    assertSafeLocation(e.DATABASE_PATH);
    const leaked = secretsInRepoEnvFiles();
    if (leaked.length) {
      console.warn(`[baseline] Secrets found in repo-local env files (${leaked.join(", ")}). Move them with \`npm run configure\` and delete the file.`);
    }
  }
  cached = e;
  return e;
}

export function isDemoMode(): boolean {
  return env().DEMO_MODE === "1";
}

export function requireSecret(name: "SESSION_SECRET" | "ENCRYPTION_KEY" | "APP_PASSWORD_HASH"): string {
  const v = env()[name];
  if (!v) throw new Error(`${name} is not configured. Run \`npm run configure\`.`);
  return v;
}
