import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { ctx } from "@/server/views";
import { addManualWeight, deleteManualWeight } from "@/server/weight";
import { offsetMs } from "@/lib/time";

const Add = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), kg: z.number().min(25).max(350) });
const Del = z.object({ tMs: z.number().int() });

/** Log a weight (local date + time in the home time zone). Duplicates of an existing entry are refused. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Add.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a weight between 25 and 350 kg." }, { status: 400 });
  const c = ctx();
  if (p.data.date > c.today) return NextResponse.json({ error: "That date is in the future." }, { status: 400 });
  const [y, m, d] = p.data.date.split("-").map(Number), [hh, mm] = p.data.time.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const off = offsetMs(guess - offsetMs(guess, c.tz), c.tz);
  const r = addManualWeight(db(), { tMs: guess - off, offsetS: Math.round(off / 1000), kg: p.data.kg });
  if (!r.ok) return NextResponse.json({ error: r.reason === "duplicate" ? "This weigh-in is already recorded (same weight within 30 minutes)." : "Weight out of range." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

/** Delete a manual entry. Entries from Google are kept (they would return with the next sync). */
export async function DELETE(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Del.safeParse(await req.json().catch(() => null));
  if (!p.success || !deleteManualWeight(db(), p.data.tMs)) return NextResponse.json({ error: "not a manual entry" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
