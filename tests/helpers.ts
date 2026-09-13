import { vi } from "vitest";
import { createDryRunAdapters } from "@/src/adapters/dryrun";
import type { Agent, Qualification } from "@/src/agent";
import { AgentConfigSchema } from "@/src/config";
import { openDb } from "@/src/db/client";
import type { PipelineDeps } from "@/src/pipeline/runner";

export const testConfig = AgentConfigSchema.parse({
  company: { name: "Acme", one_liner: "Analytics", product: "Dashboards" },
  sender: { name: "Jordan", email: "jordan@acme.test" },
  ideal_customer_profile: { description: "B2B SaaS" },
  scheduling: { booking_url: "https://cal.com/acme/intro" },
  qualification: { web_search: false },
});

export function qualification(overrides: Partial<Qualification> = {}): Qualification {
  return {
    score: 85,
    tier: "hot",
    summary: "Strong fit",
    reasons: ["Has Snowflake"],
    fit_signals: ["Series B"],
    red_flags: [],
    company_facts: [],
    recommended_action: "Book a call",
    ...overrides,
  };
}

export function stubAgent(q: Qualification = qualification()) {
  return {
    qualify: vi.fn<Agent["qualify"]>(async () => ({
      qualification: q,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
      webSearches: 0,
    })),
    research: vi.fn<Agent["research"]>(async () => ({
      brief: {
        headline: "Series B SaaS evaluating analytics",
        person: "VP Product",
        company_overview: "AP automation",
        recent_news: [],
        likely_pains: ["Slow reporting"],
        talking_points: ["Self-serve funnels"],
        discovery_questions: ["Who owns dashboards?"],
        risks: [],
        sources: [],
      },
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
      webSearches: 2,
    })),
    composeOutreach: vi.fn<Agent["composeOutreach"]>(async (input) => ({
      draft: {
        subject: `Hi ${input.lead.name}`,
        body: `Thanks for reaching out.\n\n${input.kind === "meeting_invite" ? input.bookingLink : "Here is a guide."}`,
        material_ids: [],
        personalization: "Mentioned their team",
      },
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
    })),
  };
}

export function makeDeps(agent: Agent = stubAgent()): PipelineDeps {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const adapters = createDryRunAdapters(testConfig);
  vi.spyOn(adapters.mailer, "send");
  vi.spyOn(adapters.notifier, "send");
  vi.spyOn(adapters.crm, "upsertLead");
  vi.spyOn(adapters.crm, "publishBrief");
  return { db: openDb(":memory:"), agent, adapters, config: testConfig };
}
