import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig } from "@/src/config";
import { env } from "@/src/env";
import { systemPrompt } from "./prompts";

/** Server-side refusal fallback: a declined request is re-run on Anthropic's recommended fallback model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Parameters shared by every agent call: model, fallbacks, and the cached system prompt. */
export function baseParams(config: AgentConfig) {
  return {
    model: env.agentModel,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    system: [
      { type: "text" as const, text: systemPrompt(config), cache_control: { type: "ephemeral" as const } },
    ],
  };
}

export class AgentRefusalError extends Error {}

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
}

export function addUsage(totals: UsageTotals, usage: Anthropic.Beta.BetaUsage) {
  totals.input_tokens += usage.input_tokens;
  totals.output_tokens += usage.output_tokens;
  totals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
}
