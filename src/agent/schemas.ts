import { z } from "zod";

export const QualificationSchema = z.object({
  score: z.number().int().describe("Fit and intent score from 0 (no fit) to 100 (ideal, ready to buy)"),
  tier: z
    .enum(["hot", "warm", "cold", "spam"])
    .describe("hot = book a call now; warm/cold = nurture; spam = junk, test, or clearly not a buyer"),
  summary: z.string().describe("One or two sentences a sales rep can read at a glance"),
  reasons: z.array(z.string()).describe("The main reasons behind the score"),
  fit_signals: z.array(z.string()).describe("ICP good signals observed"),
  red_flags: z.array(z.string()).describe("Concerns or bad signals observed"),
  company_facts: z
    .array(z.string())
    .describe("Facts verified about the company (size, funding, industry, stack), with source domain"),
  recommended_action: z.string().describe("The next best action for this lead"),
});
export type Qualification = z.infer<typeof QualificationSchema>;

export const OUTREACH_KINDS = ["meeting_invite", "nurture", "follow_up"] as const;
export type OutreachKind = (typeof OUTREACH_KINDS)[number];

export const OutreachDraftSchema = z.object({
  subject: z.string().describe("Short, specific subject line, no clickbait"),
  body: z
    .string()
    .describe("Plain-text email body with blank lines between paragraphs. Include the signature."),
  material_ids: z.array(z.string()).describe("IDs of content-library materials referenced in the email"),
  personalization: z.string().describe("What in the email is tailored to this lead, for the rep's review"),
});
export type OutreachDraft = z.infer<typeof OutreachDraftSchema>;
