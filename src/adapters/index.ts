import type { AgentConfig } from "@/src/config";
import { env } from "@/src/env";
import { createDryRunAdapters } from "./dryrun";
import { createGmailMailer } from "./gmail";
import { createNotionCrm } from "./notion";
import { createTelegramNotifier } from "./telegram";
import type { Adapters } from "./types";

/**
 * Picks an implementation per app: live when its credentials are set, the dry-run logger otherwise.
 * DRY_RUN=true forces every app into dry-run.
 */
export function createAdapters(config: AgentConfig): Adapters {
  const adapters = createDryRunAdapters(config);
  if (env.dryRun) return adapters;

  const e = process.env;
  if (e.GMAIL_USER && e.GMAIL_APP_PASSWORD) {
    adapters.mailer = createGmailMailer(config, e.GMAIL_USER, e.GMAIL_APP_PASSWORD);
  }
  if (e.NOTION_TOKEN && e.NOTION_DATABASE_ID) {
    adapters.crm = createNotionCrm(e.NOTION_TOKEN, e.NOTION_DATABASE_ID);
  }
  if (e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID) {
    adapters.notifier = createTelegramNotifier(e.TELEGRAM_BOT_TOKEN, e.TELEGRAM_CHAT_ID);
  }
  return adapters;
}

export type * from "./types";
