import { isAuthenticated } from "@/server/guard";
import { db } from "@/server/db/client";
import { dailySummaryCsv } from "@/server/data/export";
import { ctx } from "@/server/views";

/** Download: one row per day, one column per metric. Small enough for the phone. Never cached. */
export async function GET() {
  if (!(await isAuthenticated())) return new Response("unauthorized", { status: 401 });
  const { csv } = dailySummaryCsv(db(), ctx().fb);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="baseline-daily-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
