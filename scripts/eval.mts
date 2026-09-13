/**
 * Qualification eval: runs the real Claude qualify step over labeled leads and checks the pipeline route.
 *   npm run eval            # all cases in evals/qualification.json
 *   npm run eval -- 3       # repeat each case 3 times to measure consistency
 */
import "dotenv/config";
import fs from "node:fs";
import { qualifyLead } from "../src/agent/steps/qualify";
import { loadConfig } from "../src/config";
import type { Lead } from "../src/db/schema";
import { normalizeFlatPayload } from "../src/leads/intake";
import { routeForQualification } from "../src/pipeline/stateMachine";

interface Case {
  id: string;
  expected: "invite" | "nurture" | "disqualify";
  lead: Record<string, unknown>;
}

const repeats = Number(process.argv[2] ?? 1);
const config = loadConfig();
const cases: Case[] = JSON.parse(fs.readFileSync("evals/qualification.json", "utf8"));

let passed = 0;
let total = 0;
const rows: string[] = [];

for (const c of cases) {
  const n = normalizeFlatPayload(c.lead);
  const lead: Lead = {
    ...n,
    id: `eval-${c.id}`,
    name: n.name ?? null,
    company: n.company ?? null,
    title: n.title ?? null,
    website: n.website ?? null,
    message: n.message ?? null,
    source: "eval",
    stage: "QUALIFYING",
    tier: null,
    score: null,
    qualification: null,
    followUpCount: 0,
    meetingAt: null,
    crmRecordId: null,
    briefUrl: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const runs = await Promise.all(
    Array.from({ length: repeats }, async () => {
      const started = Date.now();
      try {
        const { qualification } = await qualifyLead(lead, config);
        return { route: routeForQualification(qualification, config), score: qualification.score, ms: Date.now() - started };
      } catch (err) {
        return { route: `error: ${(err as Error).message}`, score: NaN, ms: Date.now() - started };
      }
    }),
  );

  for (const r of runs) {
    total++;
    const ok = r.route === c.expected;
    if (ok) passed++;
    rows.push(`${ok ? "✅" : "❌"} ${c.id.padEnd(22)} expected ${c.expected.padEnd(10)} got ${String(r.route).padEnd(10)} score ${String(r.score).padStart(3)}  ${(r.ms / 1000).toFixed(1)}s`);
  }
  console.log(rows.slice(-runs.length).join("\n"));
}

console.log(`\nRouting accuracy: ${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)`);
process.exit(passed === total ? 0 : 1);
