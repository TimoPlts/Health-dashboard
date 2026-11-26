import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { setExcluded } from "@/server/analytics/workouts";

const Body = z.object({ sessionIds: z.array(z.string().min(1).max(300)).min(1).max(10), excluded: z.boolean(), reason: z.string().max(200).optional() });

/** Exclude / include exercise sessions in Baseline's analytics. Provider data is never modified. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  setExcluded(db(), parsed.data.sessionIds, parsed.data.excluded, parsed.data.reason);
  return NextResponse.json({ ok: true });
}
