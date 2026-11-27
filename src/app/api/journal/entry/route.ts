import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { setEntry } from "@/server/journal";
import { ctx } from "@/server/views";

const Body = z.object({
  habitId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.union([z.number(), z.boolean(), z.null()]),
});

/** Log a habit for a day, or clear it with value null (= not logged). Future days are refused. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid entry" }, { status: 400 });
  if (p.data.date > ctx().today) return NextResponse.json({ error: "future date" }, { status: 400 });
  if (!setEntry(db(), p.data.habitId, p.data.date, p.data.value)) return NextResponse.json({ error: "value not valid for this habit" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
