import type { Job } from "@/src/db/schema";
import { processNewLead, type PipelineDeps } from "./runner";
import { isTerminal } from "./stateMachine";
import { claimNextJob, finishJob, getLead, logEvent, updateLead } from "./store";

export const MAX_ATTEMPTS = 3;

type JobHandler = (deps: PipelineDeps, job: Job) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  process_lead: (deps, job) => processNewLead(deps, job.leadId!),
};

/** Runs every job that's due right now. Returns how many ran. */
export async function runDueJobs(deps: PipelineDeps): Promise<number> {
  let ran = 0;
  for (;;) {
    const now = deps.now?.() ?? new Date();
    const job = claimNextJob(deps.db, now);
    if (!job) return ran;
    ran++;
    await runJob(deps, job, now);
  }
}

async function runJob(deps: PipelineDeps, job: Job, now: Date) {
  const handler = handlers[job.type];
  if (!handler) {
    finishJob(deps.db, job.id, "failed", { lastError: `No handler for job type "${job.type}"` });
    return;
  }

  try {
    await handler(deps, job);
    finishJob(deps.db, job.id, "done", { lastError: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} (${job.type}) attempt ${job.attempts} failed:`, err);

    if (job.attempts < MAX_ATTEMPTS) {
      // Exponential backoff: 30s, 2m, 8m...
      const delay = 30_000 * 4 ** (job.attempts - 1);
      finishJob(deps.db, job.id, "pending", { lastError: message, runAt: new Date(now.getTime() + delay) });
      if (job.leadId) logEvent(deps.db, job.leadId, "system", "retry_scheduled", `${job.type} failed, retrying: ${message}`);
      return;
    }

    finishJob(deps.db, job.id, "failed", { lastError: message });
    if (job.leadId) {
      const lead = getLead(deps.db, job.leadId);
      if (!isTerminal(lead.stage)) updateLead(deps.db, lead.id, { stage: "ERROR", lastError: message });
      logEvent(deps.db, job.leadId, "system", "job_failed", `${job.type} failed after ${job.attempts} attempts: ${message}`);
    }
  }
}
