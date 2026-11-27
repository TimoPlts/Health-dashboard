import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { createHabit, deleteHabit, listHabits, updateHabit } from "@/server/journal";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(40), kind: z.enum(["boolean", "number", "scale"]), unit: z.string().max(16).nullable().optional() }),
  z.object({ action: z.literal("update"), id: z.string().min(1).max(64), name: z.string().trim().min(1).max(40), unit: z.string().max(16).nullable().optional() }),
  z.object({ action: z.literal("archive"), id: z.string().min(1).max(64) }),
  z.object({ action: z.literal("restore"), id: z.string().min(1).max(64) }),
  z.object({ action: z.literal("delete"), id: z.string().min(1).max(64) }),
  z.object({ action: z.literal("move"), id: z.string().min(1).max(64), direction: z.enum(["up", "down"]) }),
]);

/** Manage journal habits: create, rename, archive (keeps entries), restore, delete (removes entries), reorder. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const d = db(), a = p.data;
  if (a.action === "create") return NextResponse.json({ ok: true, id: createHabit(d, a) });
  if (a.action === "update") updateHabit(d, a.id, { name: a.name, unit: a.unit });
  if (a.action === "archive") updateHabit(d, a.id, { archived: true });
  if (a.action === "restore") updateHabit(d, a.id, { archived: false });
  if (a.action === "delete") deleteHabit(d, a.id);
  if (a.action === "move") {
    const list = listHabits(d);
    const i = list.findIndex((h) => h.id === a.id), j = a.direction === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j]!, list[i]!];
      list.forEach((h, k) => updateHabit(d, h.id, { sortOrder: k }));
    }
  }
  return NextResponse.json({ ok: true });
}
