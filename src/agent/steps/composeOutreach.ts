import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AgentConfig } from "@/src/config";
import type { Lead } from "@/src/db/schema";
import type { MeetingSlot } from "@/src/adapters/types";
import { AgentRefusalError, addUsage, baseParams, getAnthropic, type UsageTotals } from "../client";
import { outreachPrompt } from "../prompts";
import { OutreachDraftSchema, type Brief, type OutreachDraft, type OutreachKind, type Qualification } from "../schemas";

export interface ComposeInput {
  lead: Lead;
  kind: OutreachKind;
  qualification: Qualification;
  brief?: Brief;
  bookingLink: string;
  slots: MeetingSlot[];
}

export interface ComposeResult {
  draft: OutreachDraft;
  usage: UsageTotals;
}

export async function composeOutreach(input: ComposeInput, config: AgentConfig): Promise<ComposeResult> {
  const response = await getAnthropic().beta.messages.parse({
    ...baseParams(config),
    max_tokens: 8000,
    output_config: { effort: "medium", format: betaZodOutputFormat(OutreachDraftSchema) },
    messages: [
      {
        role: "user",
        content: outreachPrompt({ ...input, meetingMinutes: config.scheduling.meeting_length_minutes }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new AgentRefusalError("Claude declined to write outreach");
  if (!response.parsed_output) throw new Error(`Outreach draft could not be parsed (stop_reason: ${response.stop_reason})`);

  const draft = response.parsed_output;
  // The booking link is the whole point of an invite; never let it get paraphrased away.
  if (input.kind === "meeting_invite" && !draft.body.includes(input.bookingLink)) {
    draft.body = `${draft.body.trimEnd()}\n\nGrab a time here: ${input.bookingLink}`;
  }

  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  addUsage(usage, response.usage);
  return { draft, usage };
}
