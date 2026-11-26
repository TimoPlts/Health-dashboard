/**
 * Baseline local configuration — secrets are stored in <BASELINE_HOME>/config.env (outside OneDrive
 * and the repository). Secrets are typed into hidden prompts, never passed as arguments, so they do
 * not end up in shell history or in chat.
 *
 *   npm run configure            interactive: set what is missing (app password, Google OAuth client)
 *   npm run configure -- init    non-interactive: create the runtime folder + generated secrets only
 *   npm run configure -- status  show what is configured (never prints secret values)
 *   npm run configure -- password | google     (re)set one item
 *   npm run configure -- tailscale              private HTTPS on your tailnet (Tailscale Serve; never Funnel)
 *   npm run configure -- tailscale-off          stop serving Baseline on the tailnet
 *
 * Google client: either paste ID + secret into hidden prompts, or download the client JSON from the
 * Google console — this script finds client_secret_*.json in Downloads, imports it, and deletes it.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { hashPassword } from "../src/server/crypto";
import { assertSafeLocation, ensureSafeDir, parseEnvFile, runtimePaths, secretsInRepoEnvFiles } from "../src/server/runtime-home";

const P = runtimePaths();
const mode = process.argv[2] ?? "interactive";

function readConfig(): Record<string, string> {
  return existsSync(P.configFile) ? parseEnvFile(readFileSync(P.configFile, "utf8")) : {};
}

const ORDER = ["APP_PASSWORD_HASH", "SESSION_SECRET", "ENCRYPTION_KEY", "APP_BASE_URL", "PUBLIC_URL", "TAILNET_ALLOWED_LOGINS", "HOME_TIME_ZONE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "BACKFILL_DAYS"];

function writeConfig(c: Record<string, string>) {
  assertSafeLocation(P.configFile);
  const keys = [...ORDER.filter((k) => k in c), ...Object.keys(c).filter((k) => !ORDER.includes(k))];
  const body = [
    "# Baseline runtime configuration — PRIVATE. Managed by `npm run configure`.",
    "# Keep a copy of ENCRYPTION_KEY in your password manager: stored provider tokens cannot be decrypted without it.",
    ...keys.map((k) => `${k}=${c[k]}`),
    "",
  ].join("\n");
  const tmp = `${P.configFile}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, P.configFile); // atomic replace
}

/**
 * Windows: replace inherited ACLs on the runtime folder with "current user + SYSTEM, full control".
 * %LOCALAPPDATA% can carry extra inherited grants (e.g. sandbox/service groups) that would otherwise
 * be able to read secrets and the health database.
 */
function lockDownWindowsAcl(dir: string) {
  if (process.platform !== "win32") return;
  const user = `${process.env.USERDOMAIN ?? ""}${process.env.USERDOMAIN ? "\\" : ""}${process.env.USERNAME ?? os.userInfo().username}`;
  // 1) folder: drop inherited ACEs, grant user + SYSTEM with inheritance to children
  const r = spawnSync("icacls", [dir, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F", "/Q"], { encoding: "utf8" });
  // 2) children: reset to inherit only from the locked-down folder
  const r2 = spawnSync("icacls", [path.join(dir, "*"), "/reset", "/T", "/Q"], { encoding: "utf8" });
  if (r.status !== 0 || r2.status !== 0) console.warn(`  ! Could not restrict folder permissions (${(r.stderr || r.stdout || r2.stderr || r2.stdout).trim()}). See docs/SECURITY.md.`);
}

function init(): Record<string, string> {
  ensureSafeDir(P.home);
  lockDownWindowsAcl(P.home);
  for (const d of [P.dataDir, P.backups, P.exports, P.probeOutput, P.logs]) ensureSafeDir(d);
  const c = readConfig();
  let changed = false;
  if (!c.SESSION_SECRET) { c.SESSION_SECRET = randomBytes(32).toString("base64"); changed = true; }
  if (!c.ENCRYPTION_KEY) { c.ENCRYPTION_KEY = randomBytes(32).toString("base64"); changed = true; }
  c.APP_BASE_URL ??= "http://localhost:3000";
  c.HOME_TIME_ZONE ??= Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Brussels";
  if (changed || !existsSync(P.configFile)) writeConfig(c);
  return c;
}

/** Hidden terminal input (no echo). Handles paste, backspace, Ctrl+C. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("Run this in an interactive terminal (VS Code terminal / PowerShell)."));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value.trim());
        }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (ch === "\u0008" || ch === "\u007f") { value = value.slice(0, -1); continue; }
        if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function setPassword(c: Record<string, string>) {
  for (;;) {
    const a = await promptHidden("  New app password (min 12 chars, hidden): ");
    if (a.length < 12) { console.log("  Too short — use at least 12 characters (a passphrase is fine)."); continue; }
    const b = await promptHidden("  Repeat password: ");
    if (a !== b) { console.log("  Passwords did not match, try again."); continue; }
    c.APP_PASSWORD_HASH = hashPassword(a);
    writeConfig(c);
    console.log("  ✓ App password saved (only a scrypt hash is stored).");
    return;
  }
}

function findClientJson(): string | undefined {
  const dl = path.join(os.homedir(), "Downloads");
  if (!existsSync(dl)) return undefined;
  return readdirSync(dl)
    .filter((f) => /^client_secret_.*\.json$/i.test(f))
    .map((f) => path.join(dl, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

async function setGoogle(c: Record<string, string>) {
  const json = findClientJson();
  if (json) {
    const parsed = JSON.parse(readFileSync(json, "utf8")) as { web?: { client_id?: string; client_secret?: string; redirect_uris?: string[] } };
    if (parsed.web?.client_id && parsed.web.client_secret) {
      c.GOOGLE_CLIENT_ID = parsed.web.client_id;
      c.GOOGLE_CLIENT_SECRET = parsed.web.client_secret;
      writeConfig(c);
      unlinkSync(json);
      console.log(`  ✓ Imported Google OAuth client from Downloads and deleted the downloaded file.`);
      const expected = `${c.APP_BASE_URL ?? "http://localhost:3000"}/api/auth/google/callback`;
      if (parsed.web.redirect_uris && !parsed.web.redirect_uris.includes(expected)) {
        console.log(`  ! The client's redirect URIs do not include ${expected} — add it in the console.`);
      }
      return;
    }
    console.log(`  Found ${path.basename(json)} but it is not a "Web application" client — falling back to manual entry.`);
  }
  const id = (await promptHidden("  Google OAuth Client ID (hidden): ")).trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) { console.log("  That does not look like a Client ID (…apps.googleusercontent.com). Nothing saved."); return; }
  const secret = (await promptHidden("  Google OAuth Client secret (hidden): ")).trim();
  if (secret.length < 10) { console.log("  Secret looks too short. Nothing saved."); return; }
  c.GOOGLE_CLIENT_ID = id;
  c.GOOGLE_CLIENT_SECRET = secret;
  writeConfig(c);
  console.log("  ✓ Google OAuth client saved.");
}

// ---- Tailscale (private HTTPS for the iPhone) -------------------------------------------------------------------
const APP_PORT = 3000;
function tailscaleExe(): string | null {
  const candidates = process.platform === "win32" ? ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"] : ["tailscale"];
  for (const c of candidates) if (spawnSync(c, ["version"], { encoding: "utf8" }).status === 0) return c;
  return null;
}
function ts(exe: string, args: string[]) {
  const r = spawnSync(exe, args, { encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/**
 * Sets PUBLIC_URL (https://<this-pc>.<tailnet>.ts.net) and TAILNET_ALLOWED_LOGINS (the Tailscale user logged in on
 * this PC), then publishes 127.0.0.1:3000 on the tailnet with `tailscale serve --https=443`. Never uses Funnel.
 * The login is written to config.env but not printed.
 */
function setupTailscale(c: Record<string, string>) {
  const exe = tailscaleExe();
  if (!exe) { console.log("  Tailscale CLI not found. Install Tailscale for Windows first."); return; }
  const st = ts(exe, ["status", "--json"]);
  if (!st.ok) { console.log(`  tailscale status failed: ${st.out.slice(0, 200)}`); return; }
  const j = JSON.parse(st.out) as { BackendState?: string; Self?: { DNSName?: string; UserID?: number }; User?: Record<string, { LoginName?: string }>; CertDomains?: string[] | null };
  if (j.BackendState !== "Running") { console.log(`  Tailscale is not connected (state: ${j.BackendState}). Sign in to Tailscale and retry.`); return; }
  const dns = (j.Self?.DNSName ?? "").replace(/\.$/, "");
  if (!dns.endsWith(".ts.net")) { console.log("  MagicDNS is off. Enable it in the Tailscale admin console (DNS page) and retry."); return; }
  const login = j.User?.[String(j.Self?.UserID)]?.LoginName;
  c.PUBLIC_URL = `https://${dns}`;
  if (login) c.TAILNET_ALLOWED_LOGINS = login;
  writeConfig(c);
  console.log(`  ✓ PUBLIC_URL = ${c.PUBLIC_URL}`);
  console.log(`  ✓ Access limited to ${login ? "your Tailscale login (TAILNET_ALLOWED_LOGINS)" : "any tailnet identity (login not found)"}`);
  if (!j.CertDomains?.length) {
    console.log("\n  HTTPS certificates are not enabled for your tailnet yet.");
    console.log("  → Tailscale admin console → DNS → 'HTTPS Certificates' → Enable. Then run this command again.");
    return;
  }
  // `serve` (not `funnel`) is reachable only from devices in your tailnet.
  const r = ts(exe, ["serve", "--bg", "--https=443", `http://127.0.0.1:${APP_PORT}`]);
  console.log(r.ok ? "  ✓ Tailscale Serve: tailnet-only HTTPS → 127.0.0.1:3000" : `  ✗ tailscale serve failed: ${r.out.slice(0, 300)}`);
  console.log(`\n${ts(exe, ["serve", "status"]).out}`);
  const funnel = ts(exe, ["funnel", "status"]).out;
  if (/funnel on/i.test(funnel)) console.log("\n  ! Tailscale Funnel is ON for something on this PC. Baseline refuses Funnel traffic, but check `tailscale funnel status`.");
  console.log(`\n  On your iPhone (Tailscale app connected): open ${c.PUBLIC_URL} in Safari → Share → Add to Home Screen.`);
}
function tailscaleOff() {
  const exe = tailscaleExe();
  if (!exe) return;
  console.log(ts(exe, ["serve", "--https=443", "off"]).ok ? "  ✓ Baseline is no longer served on the tailnet." : "  Nothing was being served.");
}

function status(c: Record<string, string>) {
  const mark = (k: string) => (c[k] ? "✓ set" : "✗ missing");
  console.log(`Baseline runtime folder: ${P.home}`);
  console.log(`  config.env            ${existsSync(P.configFile) ? "present" : "missing"}`);
  console.log(`  database              ${existsSync(P.database) ? P.database : "(created on first start)"}`);
  for (const k of ["APP_PASSWORD_HASH", "SESSION_SECRET", "ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) console.log(`  ${k.padEnd(21)} ${mark(k)}`);
  console.log(`  Hevy API key          entered in the app (Settings), stored encrypted in the database`);
  console.log(`  PUBLIC_URL            ${c.PUBLIC_URL ?? "(not set — run: npm run configure -- tailscale)"}`);
  console.log(`  TAILNET_ALLOWED_LOGINS ${c.TAILNET_ALLOWED_LOGINS ? "✓ set" : "not set (any tailnet user who knows the password)"}`);
  const leaked = secretsInRepoEnvFiles();
  if (leaked.length) console.log(`  ! Secrets in repo env files: ${leaked.join(", ")} — delete them.`);
}

const c = init();
if (mode === "init") { console.log(`Initialised ${P.home}`); status(c); process.exit(0); }
if (mode === "status") { status(c); process.exit(0); }
if (mode === "tailscale") { setupTailscale(c); process.exit(0); }
if (mode === "tailscale-off") { tailscaleOff(); process.exit(0); }
if (mode === "password" || (mode === "interactive" && !c.APP_PASSWORD_HASH)) { console.log("\nApp password — used to sign in to Baseline:"); await setPassword(c); }
if (mode === "google" || (mode === "interactive" && (!c.GOOGLE_CLIENT_ID || !c.GOOGLE_CLIENT_SECRET))) {
  if (mode === "interactive") {
    const answer = await promptVisible("\nConfigure the Google OAuth client now? (y/N) ");
    if (/^y/i.test(answer)) await setGoogle(c);
  } else await setGoogle(c);
}
console.log("");
status(readConfig());

function promptVisible(q: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(q);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (d) => { process.stdin.pause(); resolve(String(d).trim()); });
  });
}
