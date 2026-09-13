import { createAdapters } from "@/src/adapters";
import { createClaudeAgent } from "@/src/agent";
import { loadConfig } from "@/src/config";
import { getDb } from "@/src/db/client";
import { env } from "@/src/env";
import { runDueJobs } from "@/src/pipeline/jobs";
import type { PipelineDeps } from "@/src/pipeline/runner";

const config = loadConfig();
const adapters = createAdapters(config);
const deps: PipelineDeps = { db: getDb(), agent: createClaudeAgent(config), adapters, config };

const liveApps = Object.values(adapters).map((a) => `${a.app}:${a.live ? "live" : "dry-run"}`);
console.log(`[worker] started (model ${env.agentModel}) · ${liveApps.join(" · ")}`);
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("[worker] ANTHROPIC_API_KEY is not set; agent steps will fail until you add it to .env");
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function main() {
  while (!stopping) {
    try {
      await runDueJobs(deps);
    } catch (err) {
      console.error("[worker] loop error:", err);
    }
    await new Promise((r) => setTimeout(r, env.workerPollMs));
  }
  process.exit(0);
}

void main();
