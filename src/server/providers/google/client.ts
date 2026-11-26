import { createThrottle, fetchWithRetry, HttpError, type RetryOptions } from "../../http";

export const GOOGLE_HEALTH_BASE = "https://health.googleapis.com/v4";

export type DataSourceFamily = "all-sources" | "google-wearables" | "google-sources" | "self-sources";

export interface ListParams {
  dataType: string;
  method: "list" | "reconcile";
  filter?: string;
  pageSize?: number;
  dataSourceFamily?: DataSourceFamily;
}

export interface Page {
  /** Exact response text — stored verbatim in raw_pages. */
  bodyText: string;
  status: number;
  requestKey: string;
  dataPoints: Record<string, unknown>[];
}

/**
 * Minimal Google Health API v4 client.
 * Per-user limit is 300 requests/minute (developers.google.com/health/rate-limits); we self-throttle to 4 req/s.
 */
export class GoogleHealthClient {
  private throttle: () => Promise<void>;

  constructor(
    private readonly getAccessToken: () => Promise<string>,
    private readonly retry: RetryOptions = {},
    private readonly onUnauthorized?: () => Promise<void>,
    throttleMs = 250,
  ) {
    this.throttle = createThrottle(throttleMs);
  }

  private async get(url: string): Promise<Response> {
    await this.throttle();
    const send = async () =>
      fetchWithRetry(url, { headers: { authorization: `Bearer ${await this.getAccessToken()}`, accept: "application/json" } }, this.retry);
    let res = await send();
    if (res.status === 401 && this.onUnauthorized) {
      // Token revoked or expired early: force a refresh once, then retry.
      await this.onUnauthorized();
      res = await send();
    }
    return res;
  }

  async getIdentity(): Promise<Record<string, unknown>> {
    const res = await this.get(`${GOOGLE_HEALTH_BASE}/users/me/identity`);
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, text.slice(0, 500), res.url);
    return JSON.parse(text) as Record<string, unknown>;
  }

  /** Iterate all pages for a list/reconcile query. Results are ordered newest-first by the API. */
  async *pages(p: ListParams): AsyncGenerator<Page> {
    let pageToken: string | undefined;
    do {
      const u = new URL(`${GOOGLE_HEALTH_BASE}/users/me/dataTypes/${p.dataType}/dataPoints${p.method === "reconcile" ? ":reconcile" : ""}`);
      if (p.filter) u.searchParams.set("filter", p.filter);
      if (p.pageSize) u.searchParams.set("pageSize", String(p.pageSize));
      if (p.dataSourceFamily) u.searchParams.set("dataSourceFamily", `users/me/dataSourceFamilies/${p.dataSourceFamily}`);
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const res = await this.get(u.toString());
      const bodyText = await res.text();
      if (!res.ok) throw new HttpError(res.status, bodyText.slice(0, 500), u.toString());
      const json = JSON.parse(bodyText) as { dataPoints?: Record<string, unknown>[]; nextPageToken?: string };
      yield {
        bodyText,
        status: res.status,
        requestKey: `${p.method} ${p.dataType} ${p.filter ?? ""} ${p.dataSourceFamily ?? ""} ${pageToken ? "page" : "first"}`,
        dataPoints: json.dataPoints ?? [],
      };
      pageToken = json.nextPageToken || undefined;
    } while (pageToken);
  }
}
