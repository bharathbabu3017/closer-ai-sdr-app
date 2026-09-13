import type { Lead, Stage } from "@/src/db/schema";

/**
 * Every external app sits behind one of these interfaces. Real implementations (Gmail, Cal.com,
 * Notion, Telegram) and the dry-run logger implement the same contract, so the pipeline never
 * knows which one it's talking to.
 */

export interface OutboundEmail {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  /** Provider thread to reply within, if continuing a conversation. */
  threadId?: string | null;
}

export interface SentEmail {
  externalId: string;
  threadId: string;
}

export interface Mailer {
  readonly app: "gmail";
  readonly live: boolean;
  send(email: OutboundEmail): Promise<SentEmail>;
}

export interface MeetingSlot {
  start: Date;
  end: Date;
}

export interface Scheduler {
  readonly app: "calcom";
  readonly live: boolean;
  bookingLink(lead: Lead): string;
  availableSlots(from: Date, days: number): Promise<MeetingSlot[]>;
}

export interface CrmSnapshot {
  lead: Lead;
  stage: Stage;
  nextAction?: string;
}

export interface Crm {
  readonly app: "notion";
  readonly live: boolean;
  /** Creates or updates the lead's CRM record; returns the record id. */
  upsertLead(snapshot: CrmSnapshot): Promise<string>;
}

export interface Notifier {
  readonly app: "telegram";
  readonly live: boolean;
  send(text: string): Promise<void>;
}

export interface Adapters {
  mailer: Mailer;
  scheduler: Scheduler;
  crm: Crm;
  notifier: Notifier;
}
