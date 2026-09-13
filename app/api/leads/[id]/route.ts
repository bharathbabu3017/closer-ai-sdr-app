import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/src/db/client";
import { events, leads, messages } from "@/src/db/schema";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/leads/[id]">) {
  const { id } = await ctx.params;
  const db = getDb();
  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({
    lead,
    events: db.select().from(events).where(eq(events.leadId, id)).orderBy(asc(events.id)).all(),
    messages: db.select().from(messages).where(eq(messages.leadId, id)).orderBy(asc(messages.id)).all(),
  });
}
