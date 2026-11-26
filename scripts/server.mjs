/**
 * Baseline production supervisor. Plain Node (no build step) so Windows Task Scheduler can start it directly:
 *
 *   node scripts/server.mjs [--home <BASELINE_HOME>]
 *
 * - Runs `next start` on 127.0.0.1:3000 (loopback only; Tailscale Serve publishes it to your tailnet).
 * - Restarts Next after a crash (backoff 2 s → 60 s; reset after 10 min of healthy uptime).
 * - Health check every 60 s on /api/health; 3 failures in a row → restart.
 * - Graceful stop: `npm run service -- stop` writes <home>/server.stop. The supervisor waits for a running sync to
 *   release its lock (≤ 2 min), then stops Next and exits. (Windows cannot deliver SIGTERM to a child; a hard stop is
 *   still safe: SQLite commits are atomic, and an interrupted sync is recorded and resumes on the next run.)
 * - Logs: <home>/logs/server-YYYY-MM-DD.log, 14 days kept, 20 MB cap per day. Next is configured not to log
 *   request URLs; Baseline's own logs contain counts and statuses, never health values.
 * - Status: <home>/server-status.json (read by `npm run service -- status` and the Settings page).
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argHome = process.argv.indexOf("--home");
const HOME = path.resolve(argHome > 0 ? process.argv[argHome + 1] : process.env.BASELINE_HOME
  ?? (process.platform === "win32" ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Baseline") : path.join(os.homedir(), ".local", "share", "baseline")));
process.env.BASELINE_HOME = HOME;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3000, HOST = "127.0.0.1";
const LOGS = path.join(HOME, "logs");
const STATUS = path.join(HOME, "server-status.json");
const STOP = path.join(HOME, "server.stop");
const LOCK = path.join(HOME, "sync.lock");
const KEEP_DAYS = 14, MAX_LOG_BYTES = 20 * 1024 * 1024;

mkdirSync(LOGS, { recursive: true });

// ---- logging ---------------------------------------------------------------------------------------------------
const logFile = () => path.join(LOGS, `server-${new Date().toISOString().slice(0, 10)}.log`);
let dropped = false;
function log(line) {
  const f = logFile();
  try {
    if (existsSync(f) && statSync(f).size > MAX_LOG_BYTES) { if (!dropped) { appendFileSync(f, `${new Date().toISOString()} [supervisor] log cap reached for today; further output dropped\n`); dropped = true; } return; }
    dropped = false;
    appendFileSync(f, `${new Date().toISOString()} ${line}\n`);
  } catch { /* logging must never crash the supervisor */ }
}
function pruneLogs() {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  for (const f of readdirSync(LOGS)) {
    const m = /^server-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
    if (m && Date.parse(m[1]) < cutoff) try { unlinkSync(path.join(LOGS, f)); } catch { /* ignore */ }
  }
}

// ---- status file -----------------------------------------------------------------------------------------------
const state = { supervisorPid: process.pid, supervisorStartedAt: Date.now(), childPid: null, childStartedAt: null, restarts: 0,
  lastExit: null, lastHealthAt: null, lastHealthOk: null, healthFailures: 0, stopping: false, port: PORT };
function writeStatus() {
  try { writeFileSync(`${STATUS}.tmp`, JSON.stringify(state, null, 1)); renameSync(`${STATUS}.tmp`, STATUS); } catch { /* ignore */ }
}

// ---- stale child from a previous, hard-killed supervisor -------------------------------------------------------
function killStaleChild() {
  try {
    const prev = JSON.parse(readFileSync(STATUS, "utf8"));
    if (prev.childPid && prev.supervisorPid !== process.pid) {
      try { process.kill(prev.childPid, 0); } catch { return; } // not running
      log(`[supervisor] stopping leftover Next process ${prev.childPid} from a previous run`);
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(prev.childPid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(prev.childPid, "SIGTERM");
    }
  } catch { /* no previous status */ }
}

/** If port 3000 is held by a leftover Next process (e.g. after a hard kill), stop it. Other programs are left alone. */
function freePort() {
  if (process.platform !== "win32") return;
  const ps = (cmd) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8", windowsHide: true }).stdout?.trim() ?? "";
  const pid = Number(ps(`(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`));
  if (!pid) return;
  const cmdline = ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`);
  if (/next/i.test(cmdline) && cmdline.toLowerCase().includes(REPO.toLowerCase())) {
    log(`[supervisor] port ${PORT} held by a leftover Next process (${pid}); stopping it`);
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else if (/next/i.test(cmdline)) {
    log(`[supervisor] port ${PORT} is used by another Next server (pid ${pid}), e.g. a dev server. Stop it; dev runs on 3001.`);
  } else {
    log(`[supervisor] port ${PORT} is used by another program (pid ${pid}); Baseline cannot start until it is free.`);
  }
}

// ---- child process -------------------------------------------------------------------------------------------
let child = null, backoffMs = 2000, restartTimer = null;
const nextBin = path.join(REPO, "node_modules", "next", "dist", "bin", "next");

function startChild() {
  if (state.stopping) return;
  freePort();
  if (!existsSync(path.join(REPO, ".next", "BUILD_ID"))) { log("[supervisor] no production build (.next/BUILD_ID). Run `npm run service -- deploy`."); scheduleRestart(); return; }
  child = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], {
    cwd: REPO, env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", BASELINE_HOME: HOME },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  state.childPid = child.pid; state.childStartedAt = Date.now(); state.healthFailures = 0; writeStatus();
  log(`[supervisor] started Next (pid ${child.pid})`);
  const pipe = (tag) => (buf) => { for (const l of String(buf).split(/\r?\n/)) if (l.trim()) log(`[${tag}] ${l}`); };
  child.stdout.on("data", pipe("next"));
  child.stderr.on("data", pipe("next:err"));
  child.on("exit", (code, signal) => {
    const upMs = Date.now() - (state.childStartedAt ?? Date.now());
    state.lastExit = { at: Date.now(), code, signal, upMs }; state.childPid = null; child = null; writeStatus();
    log(`[supervisor] Next exited (code ${code}, signal ${signal}) after ${Math.round(upMs / 1000)} s`);
    if (state.stopping) return;
    if (upMs > 10 * 60_000) backoffMs = 2000; // it ran fine for a while: restart quickly
    scheduleRestart();
  });
}
function scheduleRestart() {
  if (state.stopping || restartTimer) return;
  state.restarts++; writeStatus();
  log(`[supervisor] restarting in ${Math.round(backoffMs / 1000)} s`);
  restartTimer = setTimeout(() => { restartTimer = null; startChild(); }, backoffMs);
  backoffMs = Math.min(60_000, backoffMs * 2);
}
function killChild() {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

// ---- health ----------------------------------------------------------------------------------------------------
async function healthCheck() {
  if (!child || state.stopping || Date.now() - (state.childStartedAt ?? 0) < 30_000) return; // give Next time to boot
  let ok = false;
  try { ok = (await fetch(`http://${HOST}:${PORT}/api/health`, { signal: AbortSignal.timeout(10_000) })).ok; } catch { ok = false; }
  state.lastHealthAt = Date.now(); state.lastHealthOk = ok; state.healthFailures = ok ? 0 : state.healthFailures + 1; writeStatus();
  if (!ok) log(`[supervisor] health check failed (${state.healthFailures}/3)`);
  if (state.healthFailures >= 3) { log("[supervisor] unhealthy: restarting Next"); state.healthFailures = 0; killChild(); }
}

// ---- graceful stop ---------------------------------------------------------------------------------------------
async function stop(reason) {
  if (state.stopping) return;
  state.stopping = true; writeStatus();
  log(`[supervisor] stopping (${reason})`);
  const until = Date.now() + 120_000;
  // `next start` serves from a grandchild process, so any lock holder may be ours; waiting is harmless either way.
  while (existsSync(LOCK) && Date.now() < until) {
    log("[supervisor] waiting for the running sync to finish");
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (restartTimer) clearTimeout(restartTimer);
  killChild();
  try { unlinkSync(STOP); } catch { /* ignore */ }
  state.childPid = null; writeStatus();
  log("[supervisor] stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) process.on(sig, () => void stop(sig));
process.on("uncaughtException", (e) => { log(`[supervisor] uncaught: ${e?.message}`); });

try { unlinkSync(STOP); } catch { /* none */ }
pruneLogs();
killStaleChild();
writeStatus();
log(`[supervisor] Baseline supervisor ${process.pid} (repo ${REPO}, home ${HOME})`);
startChild();
setInterval(() => void healthCheck(), 60_000);
setInterval(() => { if (existsSync(STOP)) void stop("stop requested"); }, 1000);
setInterval(pruneLogs, 6 * 3_600_000);
