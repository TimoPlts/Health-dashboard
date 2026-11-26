import { NextResponse } from "next/server";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { disconnect, getConnection } from "@/server/connections";
import { decryptSecret } from "@/server/crypto";
import { requireSecret } from "@/server/env";
import { revokeToken } from "@/server/providers/google/oauth";

/** Disconnects a provider and deletes its stored credentials. Imported data is kept (delete it separately). */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "hevy") return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const conn = getConnection(db(), provider);
  if (provider === "google" && conn?.encRefreshToken) {
    // Best effort: revoke at Google so the grant does not linger.
    await revokeToken(decryptSecret(conn.encRefreshToken, requireSecret("ENCRYPTION_KEY"))).catch(() => {});
  }
  disconnect(db(), provider);
  return NextResponse.json({ ok: true });
}
