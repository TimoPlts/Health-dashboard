import { z } from "zod";

/**
 * Server-side configuration. Validated lazily so that `next build` and unit tests
 * do not require secrets. Never import this from client components.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  HOME_TIME_ZONE: z.string().default("Europe/Brussels"),
  DATABASE_PATH: z.string().default("./data/health.db"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  HEVY_API_KEY: z.string().optional(),
  DEMO_MODE: z.string().optional(),
  BACKFILL_DAYS: z.coerce.number().int().positive().max(3650).default(365),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  const empty = (v?: string) => (v && v.trim() !== "" ? v : undefined);
  const e: Env = {
    ...parsed,
    APP_PASSWORD_HASH: empty(parsed.APP_PASSWORD_HASH),
    SESSION_SECRET: empty(parsed.SESSION_SECRET),
    ENCRYPTION_KEY: empty(parsed.ENCRYPTION_KEY),
    GOOGLE_CLIENT_ID: empty(parsed.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: empty(parsed.GOOGLE_CLIENT_SECRET),
    HEVY_API_KEY: empty(parsed.HEVY_API_KEY),
    DEMO_MODE: empty(parsed.DEMO_MODE),
  };
  if (e.NODE_ENV === "production" && e.DEMO_MODE) {
    throw new Error("DEMO_MODE is not allowed in production. Fictional data must never be served as real data.");
  }
  cached = e;
  return e;
}

export function isDemoMode(): boolean {
  return env().DEMO_MODE === "1";
}

export function requireSecret(name: "SESSION_SECRET" | "ENCRYPTION_KEY" | "APP_PASSWORD_HASH"): string {
  const v = env()[name];
  if (!v) throw new Error(`${name} is not configured. See .env.example.`);
  return v;
}
