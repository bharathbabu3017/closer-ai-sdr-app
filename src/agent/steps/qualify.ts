import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AgentConfig } from "@/src/config";
import type { Lead } from "@/src/db/schema";
import { AgentRefusalError, addUsage, baseParams, getAnthropic, type UsageTotals } from "../client";
import { qualifyPrompt } from "../prompts";
import { QualificationSchema, type Qualification } from "../schemas";

export interface QualifyResult {
  qualification: Qualification;
  usage: UsageTotals;
  webSearches: number;
}

/**
 * Tool-runner loop: Claude may web-search to verify the company, then records its verdict by calling
 * submit_qualification. We read the verdict straight off the tool_use block and stop there, which
 * saves the extra round trip the runner would otherwise make to hand the tool result back.
 */
export async function qualifyLead(lead: Lead, config: AgentConfig): Promise<QualifyResult> {
  let submitted: Qualification | undefined;
  const submitTool = betaZodTool({
    name: "submit_qualification",
    description: "Record the final qualification for this lead. Call exactly once, when you are done.",
    inputSchema: QualificationSchema,
    run: (input) => {
      submitted = input;
      return "Recorded.";
    },
  });

  const tools: Parameters<Anthropic["beta"]["messages"]["toolRunner"]>[0]["tools"] = [submitTool];
  if (config.qualification.web_search) {
    tools.unshift({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: config.qualification.max_web_searches,
    });
  }

  const runner = getAnthropic().beta.messages.toolRunner({
    ...baseParams(config),
    max_tokens: 16000,
    max_iterations: 6,
    output_config: { effort: "medium" },
    tools,
    messages: [{ role: "user", content: qualifyPrompt(lead, config) }],
  });

  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  let webSearches = 0;

  for await (const message of runner) {
    addUsage(usage, message.usage);
    webSearches += message.usage.server_tool_use?.web_search_requests ?? 0;

    if (message.stop_reason === "refusal") throw new AgentRefusalError("Claude declined to qualify this lead");

    const call = message.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_qualification",
    );
    const parsed = call && QualificationSchema.safeParse(call.input);
    if (parsed?.success) {
      submitted = parsed.data;
      break;
    }

    // Long server-tool turns can pause; the runner doesn't resume those on its own.
    if (message.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: message.content });
    }
  }

  if (!submitted) throw new Error("Claude finished without submitting a qualification");
  return { qualification: submitted, usage, webSearches };
}
