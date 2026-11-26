import { NextResponse } from "next/server";
import { guardMutation, isAuthenticated } from "@/server/guard";
import { db } from "@/server/db/client";
import { isSyncRunning, syncAll, syncStartedAt } from "@/server/sync/run";
import { getSyncOverview } from "@/server/queries";
import { schedulerState } from "@/server/sync/scheduler";
import { getSettings } from "@/server/settings";

/** Start a sync in the background (manual trigger). Joins a running sync instead of starting a second one. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const already = isSyncRunning();
  void syncAll(db(), "manual").catch(() => {});
  return NextResponse.json({ started: !already, joined: already }, { status: 202 });
}

/** Sync status for polling. Contains no health values. */
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    running: isSyncRunning(), runningSince: syncStartedAt(),
    schedule: { ...schedulerState(), intervalMinutes: getSettings(db()).autoSyncMinutes },
    ...getSyncOverview(db()),
  });
}
