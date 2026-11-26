import type { DB } from "../db/client";
import { env } from "../env";
import { getConnection, getGoogleAccessToken, getHevyApiKey } from "../connections";
import { GoogleHealthClient } from "../providers/google/client";
import { HevyClient } from "../providers/hevy/client";
import { syncGoogle, syncHevy, type SyncLogger } from "./engine";

const g = globalThis as unknown as { __syncRunning?: Promise<unknown> };

export function isSyncRunning() {
  return g.__syncRunning !== undefined;
}

/**
 * Sync every connected provider. Only one sync runs per process at a time; a second call while one is
 * running joins the running one instead of starting a parallel import.
 */
export function syncAll(db: DB, trigger: string, log?: SyncLogger) {
  if (g.__syncRunning) return g.__syncRunning;
  const run = (async () => {
    const out: Record<string, unknown> = {};
    const google = getConnection(db, "google");
    if (google?.status === "connected") {
      const client = new GoogleHealthClient(() => getGoogleAccessToken(db), {}, async () => { await getGoogleAccessToken(db, { force: true }); });
      out.google = await syncGoogle(db, client, { backfillDays: env().BACKFILL_DAYS, trigger, log, timeZone: env().HOME_TIME_ZONE });
    }
    const hevyKey = getHevyApiKey(db);
    if (hevyKey) out.hevy = await syncHevy(db, new HevyClient(hevyKey), { trigger, log });
    return out;
  })().finally(() => { g.__syncRunning = undefined; });
  g.__syncRunning = run;
  return run;
}
