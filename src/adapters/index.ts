import type { AgentConfig } from "@/src/config";
import { createDryRunAdapters } from "./dryrun";
import type { Adapters } from "./types";

/**
 * Picks an implementation per app. Live adapters are added phase by phase; until an app is
 * configured (or when DRY_RUN is on) its dry-run logger is used.
 */
export function createAdapters(config: AgentConfig): Adapters {
  return createDryRunAdapters(config);
}

export type * from "./types";
