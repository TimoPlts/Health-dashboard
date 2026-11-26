/**
 * Run Baseline as a background service on Windows (Task Scheduler + scripts/server.mjs supervisor).
 *
 *   npm run service -- install     register the "Baseline" task (starts at boot, no window, restarts on failure)
 *   npm run service -- deploy      stop → production build → start   (run after pulling/changing code)
 *   npm run service -- start | stop | restart
 *   npm run service -- status      task, supervisor, health, last sync, HTTPS address (no health values)
 *   npm run service -- logs [N]    last N lines of today's server log (default 60)
 *   npm run service -- uninstall
 */
import "./_env";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../src/server/env";
import { runtimePaths } from "../src/server/runtime-home";

const TASK = "Baseline";
const REPO = process.cwd();
const P = runtimePaths();
const STATUS = path.join(P.home, "server-status.json");
const STOP = path.join(P.home, "server.stop");
const URL_LOCAL = "http://127.0.0.1:3000";
const cmd = process.argv[2] ?? "status";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`; // PowerShell single-quoted literal
function ps(script: string) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function health(): Promise<{ ok: boolean; uptimeS?: number } | null> {
  try { const r = await fetch(`${URL_LOCAL}/api/health`, { signal: AbortSignal.timeout(5000) }); return (await r.json()) as { ok: boolean; uptimeS: number }; } catch { return null; }
}
function readStatus(): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(STATUS, "utf8")) as Record<string, unknown>; } catch { return null; }
}
const alive = (pid: unknown) => { if (typeof pid !== "number") return false; try { process.kill(pid, 0); return true; } catch { return false; } };

function install() {
  if (process.platform !== "win32") { console.log("Windows only. On other systems run `node scripts/server.mjs` from your init system."); return; }
  if (!existsSync(path.join(REPO, ".next", "BUILD_ID"))) console.log("Note: no production build yet. Run `npm run service -- deploy` after installing.");
  const action = `New-ScheduledTaskAction -Execute ${q(process.execPath)} -Argument ${q(`"${path.join(REPO, "scripts", "server.mjs")}" --home "${P.home}"`)} -WorkingDirectory ${q(REPO)}`;
  const settings = "New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -Hidden";
  const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  // Preferred: start at boot, before anyone logs in, as you (S4U: no stored password, no window, local access only).
  const atBoot = ps(`$ErrorActionPreference='Stop'; Register-ScheduledTask -TaskName ${q(TASK)} -Force -Action (${action}) -Settings (${settings}) -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal (New-ScheduledTaskPrincipal -UserId ${q(user)} -LogonType S4U -RunLevel Limited) -Description 'Baseline health app server (127.0.0.1:3000)' | Out-Null`);
  if (atBoot.ok) { console.log("✓ Task 'Baseline' registered: starts when Windows starts (no login needed), hidden, restarts on failure."); return; }
  console.log(`  Start-at-boot needs administrator rights (${atBoot.err.split("\n")[0]?.slice(0, 120)}). Falling back to start-at-logon.`);
  // In an interactive session node.exe would open a console window; `conhost --headless` (Windows 10 1809+) runs it windowless.
  const headless = `New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ${q(`--headless "${process.execPath}" "${path.join(REPO, "scripts", "server.mjs")}" --home "${P.home}"`)} -WorkingDirectory ${q(REPO)}`;
  const atLogon = ps(`$ErrorActionPreference='Stop'; Register-ScheduledTask -TaskName ${q(TASK)} -Force -Action (${headless}) -Settings (${settings}) -Trigger (New-ScheduledTaskTrigger -AtLogOn -User ${q(user)}) -Principal (New-ScheduledTaskPrincipal -UserId ${q(user)} -LogonType Interactive -RunLevel Limited) -Description 'Baseline health app server (127.0.0.1:3000)' | Out-Null`);
  console.log(atLogon.ok ? "✓ Task 'Baseline' registered: starts when you sign in to Windows, hidden, restarts on failure.\n  For start-at-boot, run this once from an administrator terminal: npm run service -- install"
    : `✗ Could not register the task: ${atLogon.err.slice(0, 300)}`);
}

async function start() {
  const r = ps(`Start-ScheduledTask -TaskName ${q(TASK)}`);
  if (!r.ok) { console.log(`✗ ${r.err.split("\n")[0]} — is the task installed? (npm run service -- install)`); return false; }
  process.stdout.write("Starting");
  for (let i = 0; i < 60; i++) { await sleep(2000); process.stdout.write("."); if ((await health())?.ok) { console.log(" ✓ healthy"); return true; } }
  console.log(" ✗ not healthy after 2 min — see `npm run service -- logs`");
  return false;
}

async function stop() {
  const st = readStatus();
  if (!alive(st?.supervisorPid)) { ps(`Stop-ScheduledTask -TaskName ${q(TASK)} -ErrorAction SilentlyContinue`); console.log("Not running."); return; }
  writeFileSync(STOP, String(Date.now()));
  process.stdout.write("Stopping (waits for a running sync, max 2 min)");
  for (let i = 0; i < 75; i++) { await sleep(2000); process.stdout.write("."); if (!alive(st?.supervisorPid)) { console.log(" ✓ stopped"); return; } }
  ps(`Stop-ScheduledTask -TaskName ${q(TASK)}`);
  console.log(" forced stop");
}

function build() {
  console.log("Building production bundle…");
  const r = spawnSync(process.execPath, [path.join(REPO, "node_modules", "next", "dist", "bin", "next"), "build"], { cwd: REPO, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  return r.status === 0;
}

async function status() {
  const fmt = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toLocaleString() : "—");
  const task = process.platform === "win32" ? ps(`$t = Get-ScheduledTask -TaskName ${q(TASK)} -ErrorAction SilentlyContinue; if ($t) { $i = $t | Get-ScheduledTaskInfo; "$($t.State)|$($t.Triggers[0].CimClass.CimClassName)|$($i.LastRunTime)|$($i.LastTaskResult)" }`).out : "";
  if (task) { const [state, trig, last] = task.split("|"); console.log(`Task        ${state} · ${/Boot/.test(trig ?? "") ? "starts at boot" : "starts at logon"} · last start ${last}`); }
  else console.log("Task        not installed (npm run service -- install)");
  const st = readStatus();
  if (st && alive(st.supervisorPid)) {
    console.log(`Supervisor  running (pid ${st.supervisorPid}) since ${fmt(st.supervisorStartedAt)} · restarts ${st.restarts}${st.stopping ? " · stopping" : ""}`);
    console.log(`Next        ${st.childPid ? `pid ${st.childPid} since ${fmt(st.childStartedAt)}` : "not running"}${st.lastExit ? ` · last exit ${fmt((st.lastExit as { at: number }).at)} (code ${(st.lastExit as { code: unknown }).code})` : ""}`);
  } else console.log("Supervisor  not running");
  const h = await health();
  console.log(`Health      ${h ? (h.ok ? `ok · up ${Math.round((h.uptimeS ?? 0) / 60)} min` : "database not responding") : "no response on 127.0.0.1:3000"}`);
  try {
    const { openDatabase } = await import("../src/server/db/client");
    const db = openDatabase(env().DATABASE_PATH);
    const last = db.$client.prepare("select status, trigger, started_at, finished_at from sync_runs order by id desc limit 1").get() as { status: string; trigger: string; started_at: number; finished_at: number | null } | undefined;
    console.log(`Last sync   ${last ? `${last.status} (${last.trigger}) · ${fmt(last.finished_at ?? last.started_at)}` : "never"}`);
  } catch (e) { console.log(`Last sync   unknown (${(e as Error).message.slice(0, 80)})`); }
  console.log(`iPhone URL  ${env().PUBLIC_URL ?? "not configured (npm run configure -- tailscale)"}`);
  console.log(`Logs        ${P.logs}`);
}

function logs(n: number) {
  const f = path.join(P.logs, `server-${new Date().toISOString().slice(0, 10)}.log`);
  if (!existsSync(f)) { console.log(`No log for today in ${P.logs}`); return; }
  console.log(readFileSync(f, "utf8").trimEnd().split("\n").slice(-n).join("\n"));
}

switch (cmd) {
  case "install": install(); break;
  case "uninstall": await stop(); console.log(ps(`Unregister-ScheduledTask -TaskName ${q(TASK)} -Confirm:$false`).ok ? "✓ Task removed." : "Task was not installed."); break;
  case "start": await start(); break;
  case "stop": await stop(); break;
  case "restart": await stop(); await start(); break;
  case "deploy": await stop(); if (build()) await start(); else console.log("✗ Build failed; the previous build was overwritten only if the build reached that stage. Fix and re-run deploy."); break;
  case "status": await status(); break;
  case "logs": logs(Number(process.argv[3]) || 60); break;
  default: console.log("Usage: npm run service -- install | deploy | start | stop | restart | status | logs [N] | uninstall");
}
process.exit(0);
