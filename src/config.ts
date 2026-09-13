import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const MaterialSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string(),
  best_for: z.string().optional(),
});

export const AgentConfigSchema = z.object({
  company: z.object({
    name: z.string(),
    website: z.string().optional(),
    one_liner: z.string(),
    product: z.string(),
    differentiators: z.array(z.string()).default([]),
  }),
  sender: z.object({
    name: z.string(),
    title: z.string().optional(),
    email: z.string(),
    signature: z.string().optional(),
  }),
  ideal_customer_profile: z.object({
    description: z.string(),
    good_signals: z.array(z.string()).default([]),
    bad_signals: z.array(z.string()).default([]),
  }),
  qualification: z
    .object({
      hot_min_score: z.number().default(70),
      warm_min_score: z.number().default(40),
      disqualify_cold: z.boolean().default(false),
      web_search: z.boolean().default(true),
      max_web_searches: z.number().int().default(3),
    })
    .prefault({}),
  outreach: z
    .object({
      tone: z.string().default("Warm, concise and specific."),
      follow_up_days: z.array(z.number()).default([2, 5, 10]),
    })
    .prefault({}),
  scheduling: z.object({
    booking_url: z.string(),
    meeting_length_minutes: z.number().default(30),
  }),
  materials: z.array(MaterialSchema).default([]),
  autonomy: z.enum(["auto", "approve_outbound"]).default("auto"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type Material = z.infer<typeof MaterialSchema>;

let cached: AgentConfig | undefined;

/** Loads agent.config.yaml (or AGENT_CONFIG_PATH), falling back to the bundled example. */
export function loadConfig(): AgentConfig {
  if (cached) return cached;
  const candidates = [
    process.env.AGENT_CONFIG_PATH,
    "agent.config.yaml",
    "agent.config.example.yaml",
  ].filter((p): p is string => Boolean(p));

  const file = candidates.map((p) => path.resolve(p)).find((p) => fs.existsSync(p));
  if (!file) throw new Error(`No agent config found (looked for ${candidates.join(", ")})`);

  const result = AgentConfigSchema.safeParse(parse(fs.readFileSync(file, "utf8")));
  if (!result.success) {
    throw new Error(`Invalid agent config in ${file}:\n${z.prettifyError(result.error)}`);
  }
  cached = result.data;
  return cached;
}
