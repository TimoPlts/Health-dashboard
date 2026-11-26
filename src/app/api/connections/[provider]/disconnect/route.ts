import { NextResponse } from "next/server";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { disconnectProvider } from "@/server/connections";

/** Disconnects a provider: revokes Google's grant and deletes stored credentials. Imported data is kept (delete it separately). */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "hevy") return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const r = await disconnectProvider(db(), provider);
  return NextResponse.json({ ok: true, ...r });
}
