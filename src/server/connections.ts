import { eq } from "drizzle-orm";
import type { DB } from "./db/client";
import { providerConnections } from "./db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { env, requireSecret } from "./env";
import { OAuthError, refreshAccessToken, revokeToken, type GoogleOAuthConfig, type TokenSet } from "./providers/google/oauth";

export type Provider = "google" | "hevy";

export function googleOAuthConfig(): GoogleOAuthConfig {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured");
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, redirectUri: `${e.APP_BASE_URL}/api/auth/google/callback` };
}

export function getConnection(db: DB, provider: Provider) {
  return db.select().from(providerConnections).where(eq(providerConnections.provider, provider)).get();
}

function upsert(db: DB, provider: Provider, values: Partial<typeof providerConnections.$inferInsert>) {
  const now = Date.now();
  db.insert(providerConnections)
    .values({ provider, status: "connected", updatedAt: now, ...values })
    .onConflictDoUpdate({ target: providerConnections.provider, set: { ...values, updatedAt: now } })
    .run();
}

export function saveGoogleTokens(db: DB, tokens: TokenSet, externalUserId?: string) {
  const key = requireSecret("ENCRYPTION_KEY");
  const existing = getConnection(db, "google");
  upsert(db, "google", {
    status: "connected",
    encAccessToken: encryptSecret(tokens.accessToken, key),
    // Google may omit refresh_token on refresh — keep the previous one.
    encRefreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken, key) : existing?.encRefreshToken ?? null,
    accessExpiresAt: tokens.expiresAtMs,
    scopes: tokens.scope,
    lastError: null,
    ...(externalUserId ? { externalUserId } : {}),
    ...(existing?.status !== "connected" || !existing?.connectedAt ? { connectedAt: Date.now() } : {}),
  });
}

export function setConnectionError(db: DB, provider: Provider, status: "reauth_required" | "error", message: string) {
  upsert(db, provider, { status, lastError: message.slice(0, 500) });
}

/** Returns a valid access token, refreshing it if it expires within the safety margin. */
export async function getGoogleAccessToken(db: DB, opts: { force?: boolean; now?: number } = {}): Promise<string> {
  const conn = getConnection(db, "google");
  if (!conn?.encAccessToken || !conn.encRefreshToken) throw new OAuthError("not_connected", "Google Health is not connected");
  const key = requireSecret("ENCRYPTION_KEY");
  const now = opts.now ?? Date.now();
  if (!opts.force && conn.accessExpiresAt && conn.accessExpiresAt > now) return decryptSecret(conn.encAccessToken, key);
  try {
    const tokens = await refreshAccessToken(googleOAuthConfig(), decryptSecret(conn.encRefreshToken, key));
    saveGoogleTokens(db, tokens);
    return tokens.accessToken;
  } catch (e) {
    if (e instanceof OAuthError && e.requiresReauth) {
      setConnectionError(db, "google", "reauth_required", "Google authorization expired or was revoked. Reconnect in Settings.");
    }
    throw e;
  }
}

export function saveHevyApiKey(db: DB, apiKey: string, externalUserId?: string) {
  upsert(db, "hevy", {
    status: "connected",
    encApiKey: encryptSecret(apiKey, requireSecret("ENCRYPTION_KEY")),
    externalUserId: externalUserId ?? null,
    connectedAt: Date.now(),
    lastError: null,
  });
}

/** DB-stored key takes precedence over HEVY_API_KEY from the environment. */
export function getHevyApiKey(db: DB): string | undefined {
  const conn = getConnection(db, "hevy");
  if (conn?.encApiKey && conn.status !== "disconnected") return decryptSecret(conn.encApiKey, requireSecret("ENCRYPTION_KEY"));
  return env().HEVY_API_KEY;
}

export function disconnect(db: DB, provider: Provider) {
  upsert(db, provider, { status: "disconnected", encAccessToken: null, encRefreshToken: null, encApiKey: null, accessExpiresAt: null, lastError: null });
}

/**
 * Disconnect a provider: revoke Google's grant (best effort, so access does not linger at Google), then erase the
 * stored credentials. Imported data is kept unless deleted separately.
 */
export async function disconnectProvider(db: DB, provider: Provider): Promise<{ revoked: boolean }> {
  const conn = getConnection(db, provider);
  let revoked = false;
  if (provider === "google" && conn?.encRefreshToken) {
    try { await revokeToken(decryptSecret(conn.encRefreshToken, requireSecret("ENCRYPTION_KEY"))); revoked = true; } catch { revoked = false; }
  }
  disconnect(db, provider);
  return { revoked };
}
