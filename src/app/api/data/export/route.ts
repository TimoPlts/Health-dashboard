import { NextResponse } from "next/server";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { isDemoMode } from "@/server/env";
import { exportAll } from "@/server/data/export";
import { ctx } from "@/server/views";

/** Full export as CSV files into BASELINE_HOME/exports on this PC (large; not sent over the network). */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  if (isDemoMode()) return NextResponse.json({ error: "Not available in demo mode" }, { status: 400 });
  const r = await exportAll(db(), ctx().fb);
  return NextResponse.json({ ok: true, dir: r.dir, files: Object.keys(r.counts).length });
}
