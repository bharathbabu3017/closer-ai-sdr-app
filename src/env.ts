import "dotenv/config";

export const env = {
  dryRun: process.env.DRY_RUN !== "false",
  databasePath: process.env.DATABASE_PATH ?? "./data/closer.db",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  agentModel: process.env.AGENT_MODEL ?? "claude-opus-5",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 2000),
};
