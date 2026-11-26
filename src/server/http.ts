/**
 * fetch with retry, exponential backoff + full jitter, Retry-After support and a timeout.
 * Retries: network errors, 408, 429, 500, 502, 503, 504. Everything else is returned to the caller.
 */
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodySnippet: string,
    public readonly url: string,
  ) {
    super(`HTTP ${status} from ${redactUrl(url)}: ${bodySnippet}`);
    this.name = "HttpError";
  }
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: RetryOptions = {}): Promise<Response> {
  const {
    retries = 5,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    timeoutMs = 30_000,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
  } = opts;

  let attempt = 0;
  for (;;) {
    let res: Response | undefined;
    let networkError: unknown;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      networkError = e;
    }
    const retryable = networkError !== undefined || (res !== undefined && RETRYABLE.has(res.status));
    if (!retryable || attempt >= retries) {
      if (networkError) throw networkError;
      return res!;
    }
    const retryAfter = res ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
    const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    const delay = retryAfter !== undefined ? Math.min(retryAfter, maxDelayMs * 4) : Math.round(random() * backoff);
    await res?.body?.cancel().catch(() => {});
    await sleep(delay);
    attempt++;
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Remove query-string secrets before anything is logged. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/token|key|secret|code|password/i.test(k)) u.searchParams.set(k, "REDACTED");
    }
    return u.toString();
  } catch {
    return "<invalid url>";
  }
}

/** Simple spacing limiter: at most one request per `intervalMs`. */
export function createThrottle(intervalMs: number, now = () => Date.now(), sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
  let next = 0;
  return async () => {
    const t = now();
    const wait = Math.max(0, next - t);
    next = Math.max(t, next) + intervalMs;
    if (wait > 0) await sleep(wait);
  };
}
