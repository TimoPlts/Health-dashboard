import { NextResponse } from "next/server";
import { guardMutation, isAuthenticated } from "@/server/guard";
import { db } from "@/server/db/client";
import { isSyncRunning, syncAll } from "@/server/sync/run";
import { getSyncOverview } from "@/server/queries";

/** Start a sync in the background (manual trigger). */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  void syncAll(db(), "manual").catch(() => {});
  return NextResponse.json({ started: true }, { status: 202 });
}

/** Sync status for polling. Contains no health values. */
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ running: isSyncRunning(), ...getSyncOverview(db()) });
}
