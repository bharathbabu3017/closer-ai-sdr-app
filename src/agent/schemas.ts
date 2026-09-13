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

export const BriefSchema = z.object({
  headline: z.string().describe("One sentence: who they are and why this call matters"),
  person: z.string().describe("What we know about the contact: role, background, focus areas. Say so if little is public."),
  company_overview: z.string().describe("What the company does, who it sells to, size and stage"),
  recent_news: z.array(z.string()).describe("Recent funding, launches, hires or announcements, each with a date if known"),
  likely_pains: z.array(z.string()).describe("Problems we can likely solve for them, grounded in evidence"),
  talking_points: z.array(z.string()).describe("Specific angles for the call that connect their situation to our product"),
  discovery_questions: z.array(z.string()).describe("Questions to ask on the call"),
  risks: z.array(z.string()).describe("Deal risks or objections to prepare for"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).describe("Web pages the brief is based on"),
});
export type Brief = z.infer<typeof BriefSchema>;

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
