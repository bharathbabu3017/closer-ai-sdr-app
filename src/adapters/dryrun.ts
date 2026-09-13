import { randomUUID } from "node:crypto";
import type { AgentConfig } from "@/src/config";
import type { Adapters } from "./types";

const log = (app: string, message: string, data?: unknown) =>
  console.log(`[dry-run:${app}] ${message}`, data === undefined ? "" : JSON.stringify(data, null, 2));

/** Adapters that log instead of calling external apps, so the pipeline runs with only an Anthropic key. */
export function createDryRunAdapters(config: AgentConfig): Adapters {
  return {
    mailer: {
      app: "gmail",
      live: false,
      async send(email) {
        log("gmail", `send → ${email.to}: ${email.subject}`, { text: email.text });
        return { externalId: `dry-${randomUUID()}`, threadId: email.threadId ?? `dry-thread-${randomUUID()}` };
      },
    },
    scheduler: {
      app: "calcom",
      live: false,
      bookingLink(lead) {
        const url = new URL(config.scheduling.booking_url);
        url.searchParams.set("email", lead.email);
        if (lead.name) url.searchParams.set("name", lead.name);
        url.searchParams.set("metadata[leadId]", lead.id);
        return url.toString();
      },
      async availableSlots(from, days) {
        // Fake weekday 10:00/14:00 slots so outreach emails look realistic in dry-run mode.
        const slots = [];
        const length = config.scheduling.meeting_length_minutes * 60_000;
        for (let d = 1; d <= days && slots.length < 3; d++) {
          const day = new Date(from);
          day.setDate(day.getDate() + d);
          if (day.getDay() === 0 || day.getDay() === 6) continue;
          for (const hour of [10, 14]) {
            const start = new Date(day);
            start.setHours(hour, 0, 0, 0);
            slots.push({ start, end: new Date(start.getTime() + length) });
          }
        }
        return slots.slice(0, 3);
      },
    },
    crm: {
      app: "notion",
      live: false,
      async upsertLead({ lead, stage, nextAction }) {
        log("notion", `upsert lead ${lead.email} → ${stage}`, { score: lead.score, tier: lead.tier, nextAction });
        return lead.crmRecordId ?? `dry-crm-${lead.id}`;
      },
      async publishBrief(recordId, brief) {
        log("notion", `publish brief on ${recordId}: ${brief.headline}`);
        return `https://notion.so/dry-run/${recordId}`;
      },
    },
    notifier: {
      app: "telegram",
      live: false,
      async send(text) {
        log("telegram", text);
      },
    },
  };
}
