import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@/src/db/client";
import { env } from "@/src/env";
import { IntakeError, ingestLead, normalizeFlatPayload } from "@/src/leads/intake";

function authorized(req: NextRequest): boolean {
  if (!env.webhookSecret) return true;
  const token = req.headers.get("x-webhook-token") ?? req.nextUrl.searchParams.get("token") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(env.webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Generic form webhook: accepts a flat JSON object of form fields. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "body must be a JSON object" }, { status: 400 });
  }

  try {
    const source = req.nextUrl.searchParams.get("source") ?? "webhook";
    const { lead, duplicate } = ingestLead(getDb(), normalizeFlatPayload(payload as Record<string, unknown>), source);
    return Response.json({ leadId: lead.id, duplicate }, { status: duplicate ? 200 : 202 });
  } catch (err) {
    if (err instanceof IntakeError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
