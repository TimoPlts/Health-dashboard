/**
 * Baseline iOS feasibility proof (see ios-poc/README.md). Each card answers one question with a pass/fail status.
 * Shows statuses and counts only, never health values.
 */
import { CapacitorHttp } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { sha256 } from "@noble/hashes/sha2.js";
import { BUILD } from "./build-config";

type Status = "pass" | "fail" | "info" | "wait";
const $ = (id: string) => document.getElementById(id)!;
function card(id: string, title: string) {
  const el = document.createElement("section");
  el.className = "card"; el.id = id;
  el.innerHTML = `<h2>${title}</h2><div class="body"><span class="badge wait">…</span></div>`;
  $("cards").appendChild(el);
}
function show(id: string, status: Status, lines: string[], actions: { label: string; run: () => Promise<void> }[] = []) {
  const body = $(id).querySelector(".body")!;
  body.innerHTML = `<span class="badge ${status}">${{ pass: "PASS", fail: "FAIL", info: "INFO", wait: "…" }[status]}</span>` +
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  for (const a of actions) {
    const b = document.createElement("button");
    b.textContent = a.label;
    b.onclick = async () => { b.disabled = true; try { await a.run(); } catch (e) { show(id, "fail", [`${a.label}: ${errText(e)}`]); } finally { b.disabled = false; } };
    body.appendChild(b);
  }
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" ? JSON.stringify(e) : String(e)).slice(0, 300);
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomB64 = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

// ---- 1. App identity / update ---------------------------------------------------------------------------------
let db: SQLiteDBConnection;
async function storage() {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  db = await sqlite.createConnection("baseline_poc", false, "no-encryption", 1, false);
  await db.open();
  await db.execute("create table if not exists kv (k text primary key, v text); create table if not exists hr (t integer, bpm integer);");
  const get = async (k: string) => ((await db.query("select v from kv where k = ?", [k])).values?.[0]?.v as string | undefined);
  const put = (k: string, v: string) => db.run("insert into kv (k, v) values (?, ?) on conflict(k) do update set v = excluded.v", [k, v]);
  const info = await App.getInfo();
  const firstBuild = (await get("first_build")) ?? info.build;
  const firstAt = (await get("first_launch_at")) ?? new Date().toISOString();
  const launches = Number((await get("launches")) ?? "0") + 1;
  const prevBuild = await get("last_build");
  await put("first_build", firstBuild); await put("first_launch_at", firstAt); await put("launches", String(launches)); await put("last_build", info.build);
  show("c-app", "pass", [
    `${info.name} ${info.version} (build ${info.build}, commit ${BUILD.commit})`,
    `Bundle ID after signing: ${info.id}`,
  ]);
  const updated = prevBuild !== undefined && prevBuild !== info.build;
  show("c-sqlite", launches > 1 ? "pass" : "info", [
    `Launches recorded in SQLite: ${launches}`,
    `First launch: ${firstAt.slice(0, 16).replace("T", " ")} with build ${firstBuild}`,
    updated ? `Updated from build ${prevBuild} → ${info.build}: data kept ✓` : launches > 1 ? "Data kept across launches ✓" : "First launch: close and reopen the app, then install a newer build to test updates.",
  ], [{ label: "Performance test (one day of 3-s heart rate)", run: perfTest }]);
  return { firstAt };
}

/** One day of 3-second heart rate = 28,800 rows: insert, aggregate, and read back over the plugin bridge. */
async function perfTest() {
  show("c-sqlite", "wait", ["Running…"]);
  const N = 28_800, t0 = Date.UTC(2026, 0, 1);
  const chunks: { statement: string; values: number[] }[] = [];
  for (let i = 0; i < N; i += 1000) {
    const n = Math.min(1000, N - i), values: number[] = [];
    for (let k = 0; k < n; k++) values.push(t0 + (i + k) * 3000, 60 + ((i + k) % 40));
    chunks.push({ statement: `insert into hr (t, bpm) values ${Array(n).fill("(?, ?)").join(",")}`, values });
  }
  await db.execute("delete from hr");
  let s = performance.now();
  await db.executeSet(chunks, true);
  const insertMs = performance.now() - s;
  s = performance.now();
  const agg = await db.query("select count(*) as n, avg(bpm) as a from hr");
  const aggMs = performance.now() - s;
  s = performance.now();
  const rows = await db.query("select t, bpm from hr order by t");
  const readMs = performance.now() - s;
  await db.execute("delete from hr");
  show("c-sqlite", "pass", [
    `Insert ${N.toLocaleString()} rows: ${insertMs.toFixed(0)} ms`,
    `Aggregate (count/avg): ${aggMs.toFixed(0)} ms → n=${agg.values?.[0]?.n}`,
    `Read all rows into JavaScript: ${readMs.toFixed(0)} ms (${rows.values?.length} rows)`,
  ]);
}

// ---- 2. Keychain ----------------------------------------------------------------------------------------------
async function keychain() {
  let first = false, value: string;
  try { value = (await SecureStoragePlugin.get({ key: "poc_marker" })).value; }
  catch { value = randomB64(16); await SecureStoragePlugin.set({ key: "poc_marker", value }); first = true; }
  const mirror = (await db.query("select v from kv where k = 'keychain_marker'")).values?.[0]?.v as string | undefined;
  if (!mirror) await db.run("insert into kv (k, v) values ('keychain_marker', ?)", [value]);
  const same = !mirror || mirror === value;
  show("c-keychain", first ? "info" : same ? "pass" : "fail", [
    first ? "Stored a random marker in the Keychain (first launch)." : same ? "Keychain marker read back and matches the first launch ✓" : "Keychain marker changed: the Keychain was not kept (e.g. after re-signing).",
  ]);
}

// ---- 3. Background refresh (native BGAppRefreshTask writes these keys) --------------------------------------------
async function background() {
  const g = async (k: string) => (await Preferences.get({ key: k })).value;
  const [runs, last, err] = [await g("bgRunsCount"), await g("bgLastRun"), await g("bgScheduleError")];
  show("c-bg", runs ? "pass" : err ? "fail" : "info", [
    runs ? `Background refresh ran ${runs} time(s); last ${last?.slice(0, 16).replace("T", " ")} UTC` : "Not run yet. iOS decides when; leave the app in the background for a day with Background App Refresh on.",
    err ? `Scheduling error: ${err}` : "Scheduling: OK (request submitted)",
  ]);
  const hk = await g("healthkit");
  show("c-healthkit", hk?.startsWith("authorization") ? "pass" : hk?.startsWith("error") ? "fail" : "info", [hk ?? "No result yet (reopen the app)."]);
}

// ---- 4. Native HTTP (no CORS) ------------------------------------------------------------------------------------
async function network() {
  const r = await CapacitorHttp.get({ url: "https://health.googleapis.com/$discovery/rest?version=v4" });
  show("c-net", r.status === 200 ? "pass" : "fail", [`Google Health API discovery: HTTP ${r.status} (native request, no CORS)`]);
}

// ---- 5. Google OAuth (iOS client, PKCE, no secret) → Keychain → Google Health API ------------------------------------
const SCOPES = ["activity_and_fitness", "health_metrics_and_measurements", "sleep", "profile"].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`);
const clientId = BUILD.googleIosClientId;
// iOS OAuth clients redirect to the "reversed client ID" scheme: 123-abc.apps.googleusercontent.com → com.googleusercontent.apps.123-abc
const redirectUri = clientId ? `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, "")}:/oauth2redirect` : "";

async function tokenRequest(form: Record<string, string>) {
  const r = await CapacitorHttp.post({
    url: "https://oauth2.googleapis.com/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams(form).toString(),
  });
  if (r.status !== 200) throw new Error(`token endpoint HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as { access_token: string; refresh_token?: string; scope?: string; expires_in: number };
}

async function google() {
  if (!clientId) { show("c-google", "info", ["No iOS OAuth client ID in this build (repository variable GOOGLE_IOS_CLIENT_ID). See README step 3."]); return; }
  let hasRefresh = false;
  try { hasRefresh = Boolean((await SecureStoragePlugin.get({ key: "google_refresh_token" })).value); } catch { hasRefresh = false; }
  show("c-google", hasRefresh ? "pass" : "info", [hasRefresh ? "Refresh token stored in the Keychain." : "Not connected."], [
    { label: hasRefresh ? "Reconnect Google" : "Connect Google", run: connectGoogle },
    ...(hasRefresh ? [{ label: "Test: refresh token → Health API", run: testApi }] : []),
  ]);
}

async function connectGoogle() {
  const verifier = randomB64(64);
  const challenge = b64url(sha256(new TextEncoder().encode(verifier)));
  const state = randomB64(16);
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), code_challenge: challenge, code_challenge_method: "S256", state }))
    u.searchParams.set(k, v);
  show("c-google", "wait", ["Waiting for Google sign-in in Safari View Controller…"]);
  const code = await new Promise<string>((resolve, reject) => {
    const handle = App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(`${redirectUri.split(":")[0]}:`)) return;
      void (await handle).remove();
      await Browser.close().catch(() => {});
      const q = new URLSearchParams(url.split("?")[1] ?? "");
      if (q.get("state") !== state) reject(new Error("state mismatch"));
      else if (q.get("error")) reject(new Error(`Google returned: ${q.get("error")}`));
      else resolve(q.get("code") ?? "");
    });
    void Browser.open({ url: u.toString(), presentationStyle: "popover" });
  });
  const tok = await tokenRequest({ client_id: clientId, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri });
  if (!tok.refresh_token) throw new Error("Google returned no refresh token");
  await SecureStoragePlugin.set({ key: "google_refresh_token", value: tok.refresh_token });
  const granted = (tok.scope ?? "").split(" ").filter((s) => s.includes("googlehealth")).length;
  show("c-google", "pass", ["Signed in with PKCE, no client secret ✓", `Health scopes granted: ${granted} of 4`, "Refresh token stored in the Keychain ✓"], [{ label: "Test: refresh token → Health API", run: testApi }]);
}

async function testApi() {
  const refresh = (await SecureStoragePlugin.get({ key: "google_refresh_token" })).value;
  const tok = await tokenRequest({ client_id: clientId, refresh_token: refresh, grant_type: "refresh_token" });
  const auth = { authorization: `Bearer ${tok.access_token}` };
  const prof = await CapacitorHttp.get({ url: "https://health.googleapis.com/v4/users/me/profile", headers: auth });
  const day = (o: number) => new Date(Date.now() + o * 86_400_000).toISOString().slice(0, 10);
  const filter = `daily_resting_heart_rate.date >= "${day(-7)}" AND daily_resting_heart_rate.date < "${day(1)}"`;
  const rhr = await CapacitorHttp.get({ url: `https://health.googleapis.com/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints?filter=${encodeURIComponent(filter)}`, headers: auth });
  const n = rhr.status === 200 ? ((typeof rhr.data === "string" ? JSON.parse(rhr.data) : rhr.data).dataPoints ?? []).length : 0;
  show("c-google", prof.status === 200 && rhr.status === 200 ? "pass" : "fail", [
    "Access token refreshed without a client secret ✓",
    `Profile: HTTP ${prof.status}`,
    `Resting heart rate, last 7 days: HTTP ${rhr.status}, ${n} data points`,
  ], [{ label: "Run again", run: testApi }]);
}

// ---- boot ---------------------------------------------------------------------------------------------------------
async function main() {
  $("build").textContent = `build ${BUILD.number}`;
  card("c-app", "1 · Installed via SideStore"); card("c-sqlite", "2 · Local SQLite (survives relaunch & update)");
  card("c-keychain", "3 · Keychain (survives refresh & update)"); card("c-net", "4 · Native HTTP to Google");
  card("c-google", "5 · Google OAuth: iOS client, PKCE, no secret"); card("c-bg", "6 · Background refresh (BGTaskScheduler)");
  card("c-healthkit", "7 · HealthKit entitlement (free Apple ID)");
  const steps: [string, () => Promise<unknown>][] = [["c-sqlite", storage], ["c-keychain", keychain], ["c-net", network], ["c-google", google], ["c-bg", background]];
  for (const [id, fn] of steps) { try { await fn(); } catch (e) { show(id, "fail", [errText(e)]); } }
  App.addListener("resume", () => { void background(); });
}
void main();
