import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { DB } from "@/src/db/client";
import { events, jobs, leads, type App, type Job, type Lead, type Stage } from "@/src/db/schema";
import { assertTransition } from "./stateMachine";

export function getLead(db: DB, id: string): Lead {
  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) throw new Error(`Lead ${id} not found`);
  return lead;
}

export function updateLead(db: DB, id: string, patch: Partial<Lead>): Lead {
  return db
    .update(leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning()
    .get();
}

export function logEvent(
  db: DB,
  leadId: string,
  app: App,
  type: string,
  summary: string,
  data?: Record<string, unknown>,
) {
  db.insert(events).values({ leadId, app, type, summary, data }).run();
}

export function setStage(db: DB, lead: Lead, to: Stage, extra: Partial<Lead> = {}): Lead {
  assertTransition(lead.stage, to);
  const updated = updateLead(db, lead.id, { ...extra, stage: to });
  logEvent(db, lead.id, "system", "stage_changed", `${lead.stage} → ${to}`, { from: lead.stage, to });
  return updated;
}

export function enqueueJob(
  db: DB,
  job: { type: string; leadId?: string; payload?: Record<string, unknown>; runAt?: Date },
) {
  return db
    .insert(jobs)
    .values({ type: job.type, leadId: job.leadId, payload: job.payload ?? {}, runAt: job.runAt ?? new Date() })
    .returning()
    .get();
}

/** Atomically claims the next due job (single statement, so two workers can't grab the same one). */
export function claimNextJob(db: DB, now: Date): Job | undefined {
  const next = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, now)))
    .orderBy(asc(jobs.runAt))
    .limit(1);
  return db
    .update(jobs)
    .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, updatedAt: now })
    .where(and(eq(jobs.id, sql`(${next})`), eq(jobs.status, "pending")))
    .returning()
    .get();
}

export function finishJob(db: DB, id: number, status: "done" | "failed" | "pending", patch: Partial<Job> = {}) {
  db.update(jobs).set({ ...patch, status, updatedAt: new Date() }).where(eq(jobs.id, id)).run();
}
