import { createHash, randomBytes } from "node:crypto";
import { fetchWithRetry, type RetryOptions } from "../../http";

/** Google OAuth 2.0 endpoints (developers.google.com/health/migration/data-access). */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Read-only scopes only. The app never writes to Google Health. */
export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.profile.readonly",
] as const;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs: number;
  scope: string;
}

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
  /** The grant is revoked/expired (e.g. 7-day expiry while the consent screen is in "Testing"). */
  get requiresReauth() {
    return this.code === "invalid_grant";
  }
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizationUrl(cfg: GoogleOAuthConfig, state: string, codeChallenge: string): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_HEALTH_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline"); // needed for a refresh token
  u.searchParams.set("prompt", "consent"); // always return a refresh token on reconnect
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

async function tokenRequest(body: Record<string, string>, opts?: RetryOptions, now = Date.now()): Promise<TokenSet> {
  const res = await fetchWithRetry(
    GOOGLE_TOKEN_URL,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) },
    { retries: 3, ...opts },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new OAuthError(String(json.error ?? res.status), String(json.error_description ?? "Token request failed"));
  }
  if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
    throw new OAuthError("invalid_response", "Token response missing access_token/expires_in");
  }
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    // 60 s safety margin so we refresh before Google rejects the token.
    expiresAtMs: now + (json.expires_in - 60) * 1000,
    scope: typeof json.scope === "string" ? json.scope : "",
  };
}

export function exchangeCode(cfg: GoogleOAuthConfig, code: string, codeVerifier: string, opts?: RetryOptions) {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    },
    opts,
  );
}

export function refreshAccessToken(cfg: GoogleOAuthConfig, refreshToken: string, opts?: RetryOptions) {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret },
    opts,
  );
}

export async function revokeToken(token: string, opts?: RetryOptions) {
  await fetchWithRetry(
    GOOGLE_REVOKE_URL,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) },
    { retries: 1, ...opts },
  );
}
