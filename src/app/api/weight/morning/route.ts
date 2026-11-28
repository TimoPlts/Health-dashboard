import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { ctx } from "@/server/views";
import { designateMorning } from "@/server/weight";

const Body = z.object({ tMs: z.number().int(), sourceId: z.number().int().positive() });

/** Make an existing weigh-in (manual or Google) its day's morning weigh-in. Nothing is deleted. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || !designateMorning(db(), p.data.tMs, p.data.sourceId, ctx().fb)) return NextResponse.json({ error: "weigh-in not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
