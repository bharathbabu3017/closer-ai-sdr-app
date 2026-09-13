import type { Brief } from "@/src/agent/schemas";
import type { Crm } from "./types";

const NOTION_VERSION = "2022-06-28";

export async function notionApi<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Notion ${method} ${path} failed (${res.status}): ${json.message ?? "unknown error"}`);
  return json as T;
}

/** Notion caps a rich_text object at 2000 characters. */
const text = (content: string) => [{ type: "text", text: { content: content.slice(0, 2000) } }];

export const LEADS_DATABASE_PROPERTIES = {
  Name: { title: {} },
  Email: { email: {} },
  Company: { rich_text: {} },
  Stage: { select: {} },
  Tier: { select: {} },
  Score: { number: {} },
  Summary: { rich_text: {} },
  "Next action": { rich_text: {} },
};

const heading = (content: string) => ({ object: "block", type: "heading_2", heading_2: { rich_text: text(content) } });
const paragraph = (content: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: text(content) } });
const bullet = (content: string) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: text(content) },
});

function briefBlocks(brief: Brief) {
  const section = (title: string, items: string[]) => (items.length ? [heading(title), ...items.map(bullet)] : []);
  return [
    { object: "block", type: "callout", callout: { rich_text: text(brief.headline), icon: { emoji: "🎯" } } },
    heading("Contact"),
    paragraph(brief.person),
    heading("Company"),
    paragraph(brief.company_overview),
    ...section("Recent news", brief.recent_news),
    ...section("Likely pains", brief.likely_pains),
    ...section("Talking points", brief.talking_points),
    ...section("Discovery questions", brief.discovery_questions),
    ...section("Risks & objections", brief.risks),
    ...(brief.sources.length
      ? [
          heading("Sources"),
          ...brief.sources.map((s) => ({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: { rich_text: [{ type: "text", text: { content: s.title.slice(0, 200), link: { url: s.url } } }] },
          })),
        ]
      : []),
  ].slice(0, 100); // Notion accepts at most 100 blocks per request
}

/** Notion as a lightweight CRM: one database row per lead, with the pre-call brief as the page body. */
export function createNotionCrm(token: string, databaseId: string): Crm {
  return {
    app: "notion",
    live: true,
    async upsertLead({ lead, stage, nextAction }) {
      const properties = {
        Name: { title: text(lead.name ?? lead.email) },
        Email: { email: lead.email },
        Company: { rich_text: text(lead.company ?? "") },
        Stage: { select: { name: stage } },
        ...(lead.tier ? { Tier: { select: { name: lead.tier } } } : {}),
        Score: { number: lead.score },
        Summary: { rich_text: text((lead.qualification?.summary as string | undefined) ?? "") },
        "Next action": { rich_text: text(nextAction ?? "") },
      };
      if (lead.crmRecordId) {
        await notionApi(token, "PATCH", `pages/${lead.crmRecordId}`, { properties });
        return lead.crmRecordId;
      }
      const page = await notionApi<{ id: string }>(token, "POST", "pages", {
        parent: { database_id: databaseId },
        properties,
      });
      return page.id;
    },
    async publishBrief(recordId, brief) {
      await notionApi(token, "PATCH", `blocks/${recordId}/children`, { children: briefBlocks(brief) });
      const page = await notionApi<{ url: string }>(token, "GET", `pages/${recordId}`);
      return page.url;
    },
  };
}
