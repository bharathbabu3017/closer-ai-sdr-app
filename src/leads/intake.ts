import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/src/db/client";
import { leads, type Lead } from "@/src/db/schema";
import { enqueueJob, logEvent } from "@/src/pipeline/store";

export interface NormalizedLead {
  email: string;
  name?: string;
  company?: string;
  title?: string;
  website?: string;
  message?: string;
  answers: { label: string; value: string }[];
}

const FIELD_ALIASES: Record<keyof Omit<NormalizedLead, "answers">, string[]> = {
  email: ["email", "work_email", "email_address", "business_email"],
  name: ["name", "full_name", "fullname", "your_name", "contact_name"],
  company: ["company", "company_name", "organization", "organisation", "business"],
  title: ["title", "job_title", "role", "position"],
  website: ["website", "company_website", "url", "domain", "site"],
  message: ["message", "notes", "comments", "details", "how_can_we_help", "what_are_you_looking_for", "description"],
};

const normalizeKey = (key: string) =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const stringify = (value: unknown): string =>
  Array.isArray(value) ? value.map(stringify).join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);

/**
 * Maps a flat JSON form payload onto lead fields using common field-name aliases. Every field is
 * also kept as a label/value answer, so custom questions still reach Claude.
 */
export function normalizeFlatPayload(payload: Record<string, unknown>): NormalizedLead {
  const answers = Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, v]) => ({ label, value: stringify(v) }));
  const byKey = new Map(answers.map((a) => [normalizeKey(a.label), a.value]));
  const pick = (field: keyof typeof FIELD_ALIASES) =>
    FIELD_ALIASES[field].map((alias) => byKey.get(alias)).find(Boolean);

  const firstLast = [byKey.get("first_name"), byKey.get("last_name")].filter(Boolean).join(" ");
  const email = pick("email") ?? answers.find((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.value))?.value;
  if (!email) throw new IntakeError("Submission has no email address");

  return {
    email: email.trim().toLowerCase(),
    name: pick("name") ?? (firstLast || undefined),
    company: pick("company"),
    title: pick("title"),
    website: pick("website"),
    message: pick("message"),
    answers,
  };
}

export class IntakeError extends Error {}

export interface IntakeResult {
  lead: Lead;
  duplicate: boolean;
}

/** Stores a submission and queues it for the agent. Repeat submissions from the same email don't restart the pipeline. */
export function ingestLead(db: DB, input: NormalizedLead, source: string): IntakeResult {
  const existing = db.select().from(leads).where(eq(leads.email, input.email)).get();
  if (existing) {
    logEvent(db, existing.id, "form", "duplicate_submission", `Submitted the ${source} form again`, { answers: input.answers });
    return { lead: existing, duplicate: true };
  }

  const lead = db
    .insert(leads)
    .values({ id: randomUUID(), ...input, source })
    .returning()
    .get();
  logEvent(db, lead.id, "form", "submitted", `New ${source} submission from ${lead.name ?? lead.email}`, {
    answers: input.answers,
  });
  enqueueJob(db, { type: "process_lead", leadId: lead.id });
  return { lead, duplicate: false };
}
