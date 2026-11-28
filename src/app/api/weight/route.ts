import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { ctx } from "@/server/views";
import { addManualWeight, deleteManualWeight, logMorningWeight, NOTE_MAX, updateManualWeight } from "@/server/weight";
import { zonedInstant } from "@/lib/time";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kg = z.number().min(25).max(350);
const note = z.string().max(NOTE_MAX).nullable().optional();
/** Quick morning log (no time: one designated weigh-in per day, corrected in place) or an extra entry at a time. */
const Add = z.union([
  z.object({ mode: z.literal("morning"), date, kg, note }),
  z.object({ date, time: z.string().regex(/^\d{2}:\d{2}$/), kg, note }),
]);
const Patch = z.object({ tMs: z.number().int(), kg: kg.optional(), note });
const Del = z.object({ tMs: z.number().int() });

export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Add.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a weight between 25 and 350 kg." }, { status: 400 });
  const c = ctx();
  if (p.data.date > c.today) return NextResponse.json({ error: "That date is in the future." }, { status: 400 });
  if ("mode" in p.data) {
    const r = logMorningWeight(db(), { date: p.data.date, kg: p.data.kg, note: p.data.note, today: c.today, nowMs: Date.now(), tz: c.tz, fbOffsetS: c.fb });
    if (!r.ok) return NextResponse.json({ error: r.reason === "future" ? "That date is in the future." : "Weight out of range." }, { status: 400 });
    return NextResponse.json({ ok: true, action: r.action });
  }
  const [hh, mm] = p.data.time.split(":").map(Number);
  const at = zonedInstant(p.data.date, hh!, mm!, c.tz);
  const r = addManualWeight(db(), { ...at, kg: p.data.kg, note: p.data.note });
  if (!r.ok) return NextResponse.json({ error: r.reason === "duplicate" ? "This weigh-in is already recorded (same weight within 30 minutes)." : "Weight out of range." }, { status: 409 });
  return NextResponse.json({ ok: true, action: "created" });
}

/** Correct a manual entry's weight and/or note. Google entries are read-only. */
export async function PATCH(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a weight between 25 and 350 kg." }, { status: 400 });
  if (!updateManualWeight(db(), p.data.tMs, { kg: p.data.kg, note: p.data.note })) return NextResponse.json({ error: "not a manual entry" }, { status: 404 });
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
