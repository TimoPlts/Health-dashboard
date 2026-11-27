import { NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";
const startedAt = Date.now();

/**
 * Liveness for the local supervisor and for `tailscale serve` checks. Unauthenticated on purpose,
 * so it returns NO personal or health data: only whether the server and its database respond.
 */
export function GET() {
  let database = false;
  try { database = db().$client.prepare("select 1 as ok").get() !== undefined; } catch { database = false; }
  return NextResponse.json({ ok: database, database, uptimeS: Math.round((Date.now() - startedAt) / 1000) }, { status: database ? 200 : 503 });
}
