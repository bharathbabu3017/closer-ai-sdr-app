import { and, eq } from "drizzle-orm";
import type { Adapters } from "@/src/adapters/types";
import type { Agent, Brief, OutreachKind } from "@/src/agent";
import type { AgentConfig } from "@/src/config";
import type { DB } from "@/src/db/client";
import { messages, type App, type Lead } from "@/src/db/schema";
import { textToEmailHtml } from "@/src/lib/emailHtml";
import { effectiveTier, routeForQualification } from "./stateMachine";
import { getLead, logEvent, setStage, updateLead } from "./store";

export interface PipelineDeps {
  db: DB;
  agent: Agent;
  adapters: Adapters;
  config: AgentConfig;
  now?: () => Date;
}

/**
 * Side effects that shouldn't stall the pipeline (CRM sync, team notifications). Failures are
 * recorded on the timeline instead of failing the job.
 */
async function bestEffort(deps: PipelineDeps, lead: Lead, app: App, label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    logEvent(deps.db, lead.id, app, "error", `${label} failed: ${(err as Error).message}`);
  }
}

async function syncCrm(deps: PipelineDeps, lead: Lead, nextAction: string) {
  await bestEffort(deps, lead, "notion", "CRM sync", async () => {
    const recordId = await deps.adapters.crm.upsertLead({ lead, stage: lead.stage, nextAction });
    if (recordId !== lead.crmRecordId) updateLead(deps.db, lead.id, { crmRecordId: recordId });
    logEvent(deps.db, lead.id, "notion", "crm_synced", `CRM record updated (${lead.stage})`, { recordId, live: deps.adapters.crm.live });
  });
}

/** Qualify a fresh lead, then either disqualify it or send the first email. Safe to retry. */
export async function processNewLead(deps: PipelineDeps, leadId: string): Promise<void> {
  const { db, agent, adapters, config } = deps;
  const now = deps.now?.() ?? new Date();
  let lead = getLead(db, leadId);

  if (!["NEW", "QUALIFYING", "ERROR"].includes(lead.stage)) return;
  if (lead.stage !== "QUALIFYING") lead = setStage(db, lead, "QUALIFYING");

  // 1. Qualify (Claude + web search)
  const { qualification, usage, webSearches } = await agent.qualify(lead);
  const tier = effectiveTier(qualification, config);
  lead = updateLead(db, lead.id, { score: qualification.score, tier, qualification, lastError: null });
  logEvent(db, lead.id, "claude", "qualified", `Scored ${qualification.score}/100 (${tier}): ${qualification.summary}`, {
    qualification,
    usage,
    webSearches,
  });

  const route = routeForQualification(qualification, config);
  if (route === "disqualify") {
    lead = setStage(db, lead, "DISQUALIFIED");
    await syncCrm(deps, lead, "None, disqualified");
    return;
  }

  await syncCrm(deps, lead, route === "invite" ? "Research + send meeting invite" : "Send nurture email");
  lead = getLead(db, lead.id);

  // 2. Hot leads: deep research → pre-call brief on the CRM record
  let brief: Brief | undefined;
  if (route === "invite") {
    await bestEffort(deps, lead, "claude", "Research", async () => {
      const research = await agent.research(lead, qualification);
      brief = research.brief;
      logEvent(db, lead.id, "claude", "researched", `Researched lead (${research.webSearches} web searches): ${brief.headline}`, {
        brief,
        usage: research.usage,
      });
    });
    if (brief && lead.crmRecordId && !lead.briefUrl) {
      const researched = brief;
      await bestEffort(deps, lead, "notion", "Brief publishing", async () => {
        const url = await adapters.crm.publishBrief(lead.crmRecordId!, researched);
        lead = updateLead(db, lead.id, { briefUrl: url });
        logEvent(db, lead.id, "notion", "brief_published", "Pre-call brief written to Notion", { url, live: adapters.crm.live });
      });
    }
  }

  // 3. First email, unless a previous attempt already sent it
  const alreadySent = db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.leadId, lead.id), eq(messages.direction, "outbound"), eq(messages.status, "sent")))
    .get();

  if (!alreadySent) {
    const kind: OutreachKind = route === "invite" ? "meeting_invite" : "nurture";
    const bookingLink = adapters.scheduler.bookingLink(lead);
    const slots = kind === "meeting_invite" ? await adapters.scheduler.availableSlots(now, 7) : [];
    if (slots.length) {
      logEvent(db, lead.id, "calcom", "slots_fetched", `Found ${slots.length} open slots to propose`, {
        slots: slots.map((s) => s.start.toISOString()),
        live: adapters.scheduler.live,
      });
    }

    const { draft, usage: composeUsage } = await agent.composeOutreach({ lead, kind, qualification, brief, bookingLink, slots });
    logEvent(db, lead.id, "claude", "outreach_drafted", `Drafted ${kind.replace("_", " ")}: "${draft.subject}"`, {
      draft,
      usage: composeUsage,
    });

    const sent = await adapters.mailer.send({
      to: lead.email,
      toName: lead.name,
      subject: draft.subject,
      text: draft.body,
      html: textToEmailHtml(draft.body),
    });
    db.insert(messages)
      .values({
        leadId: lead.id,
        direction: "outbound",
        kind,
        subject: draft.subject,
        bodyText: draft.body,
        status: "sent",
        threadId: sent.threadId,
        externalId: sent.externalId,
        sentAt: new Date(),
      })
      .run();
    logEvent(db, lead.id, "gmail", "email_sent", `Emailed ${lead.email}: "${draft.subject}"`, {
      threadId: sent.threadId,
      live: adapters.mailer.live,
    });
  }

  lead = setStage(db, lead, route === "invite" ? "MEETING_INVITED" : "NURTURING");
  await syncCrm(deps, lead, route === "invite" ? "Wait for booking" : "Follow up if no reply");

  // 4. Tell the team
  if (route === "invite") {
    const current = lead;
    await bestEffort(deps, current, "telegram", "Hot lead alert", async () => {
      const lines = [
        `🔥 Hot lead: ${current.name ?? current.email}${current.company ? ` (${current.company})` : ""}, score ${qualification.score}/100`,
        qualification.summary,
        brief ? `\nTalking points:\n${brief.talking_points.slice(0, 3).map((t) => `• ${t}`).join("\n")}` : "",
        `\n✉️ Meeting invite sent to ${current.email}`,
        current.briefUrl ? `📄 Pre-call brief: ${current.briefUrl}` : "",
      ];
      await adapters.notifier.send(lines.filter(Boolean).join("\n"));
      logEvent(db, current.id, "telegram", "notified", "Hot lead alert posted to sales group", { live: adapters.notifier.live });
    });
  }
}
