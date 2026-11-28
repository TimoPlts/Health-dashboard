import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { createPhase, deletePhase, listPhases, updatePhase } from "@/server/weight";
import { PHASE_KINDS } from "@/lib/metrics/weight-tracker";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Phase = z.object({
  kind: z.enum(PHASE_KINDS), name: z.string().trim().min(1).max(40), startDate: date, startKg: z.number().min(25).max(350),
  endDate: date.nullable(), goalKg: z.number().min(25).max(350).nullable(), targetRateKgWeek: z.number().min(-2).max(2).nullable(),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), phase: Phase }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), phase: Phase }),
  z.object({ action: z.literal("end"), id: z.string().uuid(), endDate: date }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

/** Weight phases (cutting / maintaining / bulking): create, edit, end or delete. Ended phases stay as history. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Check the phase details." }, { status: 400 });
  const d = db(), b = p.data;
  if (b.action === "delete") return deletePhase(d, b.id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Phase not found." }, { status: 404 });
  if (b.action === "end") {
    const cur = listPhases(d).find((x) => x.id === b.id);
    if (!cur) return NextResponse.json({ error: "Phase not found." }, { status: 404 });
    const { id: _id, ...rest } = cur;
    const r = updatePhase(d, b.id, { ...rest, endDate: b.endDate });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  const r = b.action === "create" ? createPhase(d, b.phase) : updatePhase(d, b.id, b.phase);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
