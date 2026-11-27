import { NextResponse } from "next/server";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { isDemoMode } from "@/server/env";
import { createBackup } from "@/server/data/backup";

/** Back up now (consistent online backup into BASELINE_HOME/backups). */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  if (isDemoMode()) return NextResponse.json({ error: "Not available in demo mode" }, { status: 400 });
  const b = await createBackup(db(), "manual");
  return NextResponse.json({ ok: true, name: b.name, bytes: b.bytes });
}
