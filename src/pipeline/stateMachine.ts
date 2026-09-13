import type { Stage, Tier } from "@/src/db/schema";
import type { AgentConfig } from "@/src/config";

const TERMINAL: Stage[] = ["DISQUALIFIED", "CLOSED_LOST", "DONE"];

const TRANSITIONS: Record<Stage, Stage[]> = {
  NEW: ["QUALIFYING"],
  QUALIFYING: ["MEETING_INVITED", "NURTURING", "DISQUALIFIED"],
  MEETING_INVITED: ["MEETING_BOOKED", "REPLIED", "CLOSED_LOST"],
  NURTURING: ["MEETING_INVITED", "MEETING_BOOKED", "REPLIED", "CLOSED_LOST"],
  REPLIED: ["MEETING_INVITED", "NURTURING", "MEETING_BOOKED", "CLOSED_LOST"],
  MEETING_BOOKED: ["RESEARCHING", "MEETING_INVITED", "CLOSED_LOST"],
  RESEARCHING: ["BRIEF_READY"],
  BRIEF_READY: ["DONE", "MEETING_INVITED", "CLOSED_LOST"],
  DISQUALIFIED: [],
  CLOSED_LOST: [],
  DONE: [],
  ERROR: [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  // Any live lead can fall into ERROR, and a failed step can be retried from ERROR.
  if (to === "ERROR") return !TERMINAL.includes(from);
  if (from === "ERROR") return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Stage, to: Stage) {
  if (!canTransition(from, to)) throw new Error(`Invalid stage transition ${from} → ${to}`);
}

export function isTerminal(stage: Stage) {
  return TERMINAL.includes(stage);
}

export type Route = "invite" | "nurture" | "disqualify";

/** Maps Claude's verdict to a pipeline route, applying the thresholds from agent.config.yaml. */
export function routeForQualification(q: { score: number; tier: Tier }, config: AgentConfig): Route {
  const { hot_min_score, warm_min_score, disqualify_cold } = config.qualification;
  if (q.tier === "spam") return "disqualify";
  if (q.score >= hot_min_score) return "invite";
  if (q.score < warm_min_score && disqualify_cold) return "disqualify";
  return "nurture";
}

/** The tier we store follows the configured thresholds, so the dashboard and routing always agree. */
export function effectiveTier(q: { score: number; tier: Tier }, config: AgentConfig): Tier {
  if (q.tier === "spam") return "spam";
  if (q.score >= config.qualification.hot_min_score) return "hot";
  if (q.score >= config.qualification.warm_min_score) return "warm";
  return "cold";
}
