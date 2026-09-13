import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AgentConfig } from "@/src/config";
import type { Lead } from "@/src/db/schema";
import { AgentRefusalError, addUsage, baseParams, getAnthropic, type UsageTotals } from "../client";
import { leadBlock } from "../prompts";
import { BriefSchema, type Brief, type Qualification } from "../schemas";

export interface ResearchResult {
  brief: Brief;
  usage: UsageTotals;
  webSearches: number;
}

/** Deep research for a high-potential lead: web search + fetch, finished by a submit_brief tool call. */
export async function researchLead(lead: Lead, qualification: Qualification, config: AgentConfig): Promise<ResearchResult> {
  const submitTool = betaZodTool({
    name: "submit_brief",
    description: "Record the finished pre-call brief. Call exactly once, when your research is done.",
    inputSchema: BriefSchema,
    run: () => "Recorded.",
  });

  const runner = getAnthropic().beta.messages.toolRunner({
    ...baseParams(config),
    max_tokens: 32000,
    max_iterations: 10,
    output_config: { effort: "medium" },
    tools: [
      { type: "web_search_20260209", name: "web_search", max_uses: 6 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
      submitTool,
    ],
    messages: [
      {
        role: "user",
        content: `This lead is high-potential and we are inviting them to a call. Research the person and their company so the rep walks in prepared.

${leadBlock(lead)}

<qualification>
Score ${qualification.score}: ${qualification.summary}
Known facts: ${qualification.company_facts.join("; ") || "none"}
</qualification>

Look for: what the company does and for whom, size and funding, recent news, the contact's role and background, and signals about their analytics or data stack. Only state facts you found or that the lead told us; mark inferences as such. Be efficient: a handful of targeted searches is enough.

When done, call submit_brief once.`,
      },
    ],
  });

  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  let webSearches = 0;

  for await (const message of runner) {
    addUsage(usage, message.usage);
    webSearches += message.usage.server_tool_use?.web_search_requests ?? 0;
    if (message.stop_reason === "refusal") throw new AgentRefusalError("Claude declined to research this lead");

    const call = message.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_brief",
    );
    const parsed = call && BriefSchema.safeParse(call.input);
    if (parsed?.success) return { brief: parsed.data, usage, webSearches };

    if (message.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: message.content });
    }
  }
  throw new Error("Claude finished without submitting a brief");
}
