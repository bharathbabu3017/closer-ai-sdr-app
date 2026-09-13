import type { AgentConfig } from "@/src/config";
import type { Lead } from "@/src/db/schema";
import { composeOutreach, type ComposeInput, type ComposeResult } from "./steps/composeOutreach";
import { qualifyLead, type QualifyResult } from "./steps/qualify";
import { researchLead, type ResearchResult } from "./steps/research";
import type { Qualification } from "./schemas";

/** The decisions the pipeline delegates to Claude. Tests swap in a stub. */
export interface Agent {
  qualify(lead: Lead): Promise<QualifyResult>;
  research(lead: Lead, qualification: Qualification): Promise<ResearchResult>;
  composeOutreach(input: ComposeInput): Promise<ComposeResult>;
}

export function createClaudeAgent(config: AgentConfig): Agent {
  return {
    qualify: (lead) => qualifyLead(lead, config),
    research: (lead, qualification) => researchLead(lead, qualification, config),
    composeOutreach: (input) => composeOutreach(input, config),
  };
}

export type * from "./schemas";
export type { QualifyResult, ResearchResult, ComposeInput, ComposeResult };
