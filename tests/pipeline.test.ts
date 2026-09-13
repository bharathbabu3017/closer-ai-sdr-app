import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { events, jobs, messages } from "@/src/db/schema";
import { ingestLead, normalizeFlatPayload } from "@/src/leads/intake";
import { MAX_ATTEMPTS, runDueJobs } from "@/src/pipeline/jobs";
import { getLead } from "@/src/pipeline/store";
import { makeDeps, qualification, stubAgent } from "./helpers";

const submission = { full_name: "Priya Raman", work_email: "Priya@LedgerLoop.io", company_name: "LedgerLoop" };

afterEach(() => vi.restoreAllMocks());

describe("pipeline: new lead", () => {
  it("invites a hot lead to a meeting and touches every app", async () => {
    const deps = makeDeps();
    const { lead } = ingestLead(deps.db, normalizeFlatPayload(submission), "test");

    expect(await runDueJobs(deps)).toBe(1);

    const updated = getLead(deps.db, lead.id);
    expect(updated).toMatchObject({ stage: "MEETING_INVITED", tier: "hot", score: 85 });

    const sent = deps.db.select().from(messages).where(eq(messages.leadId, lead.id)).all();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "meeting_invite", status: "sent" });
    expect(sent[0].bodyText).toContain("https://cal.com/acme/intro");
    expect(deps.adapters.notifier.send).toHaveBeenCalledOnce();

    const apps = new Set(deps.db.select().from(events).where(eq(events.leadId, lead.id)).all().map((e) => e.app));
    expect([...apps].sort()).toEqual(["calcom", "claude", "form", "gmail", "notion", "system", "telegram"]);
  });

  it("nurtures a warm lead without alerting the team", async () => {
    const deps = makeDeps(stubAgent(qualification({ score: 55, tier: "warm" })));
    const { lead } = ingestLead(deps.db, normalizeFlatPayload(submission), "test");
    await runDueJobs(deps);

    expect(getLead(deps.db, lead.id)).toMatchObject({ stage: "NURTURING", tier: "warm" });
    expect(deps.adapters.notifier.send).not.toHaveBeenCalled();
    expect(deps.adapters.mailer.send).toHaveBeenCalledOnce();
  });

  it("disqualifies spam without sending email", async () => {
    const deps = makeDeps(stubAgent(qualification({ score: 90, tier: "spam" })));
    const { lead } = ingestLead(deps.db, normalizeFlatPayload(submission), "test");
    await runDueJobs(deps);

    expect(getLead(deps.db, lead.id).stage).toBe("DISQUALIFIED");
    expect(deps.adapters.mailer.send).not.toHaveBeenCalled();
  });

  it("does not restart the pipeline for a duplicate submission", () => {
    const deps = makeDeps();
    ingestLead(deps.db, normalizeFlatPayload(submission), "test");
    const second = ingestLead(deps.db, normalizeFlatPayload({ ...submission, work_email: "priya@ledgerloop.io" }), "test");

    expect(second.duplicate).toBe(true);
    expect(deps.db.select().from(jobs).all()).toHaveLength(1);
  });

  it("keeps a CRM failure from blocking outreach", async () => {
    const deps = makeDeps();
    vi.mocked(deps.adapters.crm.upsertLead).mockRejectedValue(new Error("Notion is down"));
    const { lead } = ingestLead(deps.db, normalizeFlatPayload(submission), "test");
    await runDueJobs(deps);

    expect(getLead(deps.db, lead.id).stage).toBe("MEETING_INVITED");
    const errors = deps.db.select().from(events).where(eq(events.type, "error")).all();
    expect(errors[0].summary).toContain("Notion is down");
  });

  it("retries a failing step with backoff, then marks the lead ERROR", async () => {
    const agent = stubAgent();
    agent.qualify.mockRejectedValue(new Error("overloaded"));
    const deps = makeDeps(agent);
    const { lead } = ingestLead(deps.db, normalizeFlatPayload(submission), "test");

    let clock = Date.now();
    deps.now = () => new Date(clock);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await runDueJobs(deps);
      clock += 60 * 60_000;
    }

    const [job] = deps.db.select().from(jobs).all();
    expect(job).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, lastError: "overloaded" });
    expect(getLead(deps.db, lead.id)).toMatchObject({ stage: "ERROR", lastError: "overloaded" });
  });
});
