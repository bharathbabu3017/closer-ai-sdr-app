import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const STAGES = [
  "NEW",
  "QUALIFYING",
  "DISQUALIFIED",
  "MEETING_INVITED",
  "NURTURING",
  "REPLIED",
  "MEETING_BOOKED",
  "RESEARCHING",
  "BRIEF_READY",
  "CLOSED_LOST",
  "DONE",
  "ERROR",
] as const;
export type Stage = (typeof STAGES)[number];

export const TIERS = ["hot", "warm", "cold", "spam"] as const;
export type Tier = (typeof TIERS)[number];

/** External systems an event can be attributed to; the dashboard timeline groups by this. */
export const APPS = ["form", "claude", "gmail", "calcom", "notion", "telegram", "system"] as const;
export type App = (typeof APPS)[number];

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  company: text("company"),
  title: text("title"),
  website: text("website"),
  message: text("message"),
  source: text("source").notNull().default("webhook"),
  /** Every answer from the form as label/value pairs, so Claude sees fields we don't map explicitly. */
  answers: text("answers", { mode: "json" }).$type<{ label: string; value: string }[]>().notNull(),
  stage: text("stage", { enum: STAGES }).notNull().default("NEW"),
  tier: text("tier", { enum: TIERS }),
  score: integer("score"),
  qualification: text("qualification", { mode: "json" }).$type<Record<string, unknown>>(),
  followUpCount: integer("follow_up_count").notNull().default(0),
  meetingAt: integer("meeting_at", { mode: "timestamp_ms" }),
  crmRecordId: text("crm_record_id"),
  briefUrl: text("brief_url"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: text("lead_id").notNull().references(() => leads.id),
    app: text("app", { enum: APPS }).notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("events_lead_idx").on(t.leadId)],
);

export const JOB_STATUSES = ["pending", "running", "done", "failed", "cancelled"] as const;

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: text("lead_id").references(() => leads.id),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("pending"),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: text("lead_id").notNull().references(() => leads.id),
    direction: text("direction", { enum: ["outbound", "inbound"] }).notNull(),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    status: text("status", { enum: ["draft", "pending_approval", "sent", "received", "failed"] }).notNull(),
    threadId: text("thread_id"),
    externalId: text("external_id"),
    createdAt: createdAt(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("messages_lead_idx").on(t.leadId)],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadEvent = typeof events.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Message = typeof messages.$inferSelect;
