/**
 * One-time integration setup.
 *   npm run setup telegram   # prints chat IDs that have messaged your bot
 *   npm run setup notion     # creates the "Closer Leads" database under NOTION_PARENT_PAGE_ID
 *   npm run setup check      # verifies every configured integration
 */
import "dotenv/config";
import nodemailer from "nodemailer";
import { LEADS_DATABASE_PROPERTIES, notionApi } from "../src/adapters/notion";
import { telegramApi } from "../src/adapters/telegram";

const e = process.env;
const cmd = process.argv[2] ?? "check";

function need(...names: string[]) {
  const missing = names.filter((n) => !e[n]);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    process.exit(1);
  }
}

if (cmd === "telegram") {
  need("TELEGRAM_BOT_TOKEN");
  type Update = { message?: { chat: { id: number; title?: string; username?: string; first_name?: string; type: string } } };
  const updates = await telegramApi<Update[]>(e.TELEGRAM_BOT_TOKEN!, "getUpdates");
  const chats = new Map(updates.filter((u) => u.message).map((u) => [u.message!.chat.id, u.message!.chat]));
  if (!chats.size) console.log("No messages yet. Send your bot a message (or add it to a group and post there), then rerun.");
  for (const chat of chats.values()) {
    console.log(`TELEGRAM_CHAT_ID=${chat.id}   # ${chat.type}: ${chat.title ?? chat.username ?? chat.first_name}`);
  }
} else if (cmd === "notion") {
  need("NOTION_TOKEN", "NOTION_PARENT_PAGE_ID");
  const db = await notionApi<{ id: string; url: string }>(e.NOTION_TOKEN!, "POST", "databases", {
    parent: { type: "page_id", page_id: e.NOTION_PARENT_PAGE_ID },
    title: [{ type: "text", text: { content: "Closer Leads" } }],
    properties: LEADS_DATABASE_PROPERTIES,
  });
  console.log(`Created database: ${db.url}\n\nNOTION_DATABASE_ID=${db.id}`);
} else if (cmd === "check") {
  const results: [string, Promise<string>][] = [];
  if (e.ANTHROPIC_API_KEY) results.push(["Anthropic", Promise.resolve("key set")]);
  if (e.GMAIL_USER && e.GMAIL_APP_PASSWORD) {
    const t = nodemailer.createTransport({ service: "gmail", auth: { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD } });
    results.push(["Gmail", t.verify().then(() => `SMTP login ok as ${e.GMAIL_USER}`)]);
  }
  if (e.NOTION_TOKEN && e.NOTION_DATABASE_ID) {
    results.push(["Notion", notionApi<{ url: string }>(e.NOTION_TOKEN, "GET", `databases/${e.NOTION_DATABASE_ID}`).then((d) => d.url)]);
  }
  if (e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID) {
    results.push([
      "Telegram",
      telegramApi<{ username: string }>(e.TELEGRAM_BOT_TOKEN, "getMe").then((b) => `bot @${b.username} → chat ${e.TELEGRAM_CHAT_ID}`),
    ]);
  }
  for (const [name, p] of results) {
    try {
      console.log(`✅ ${name}: ${await p}`);
    } catch (err) {
      console.log(`❌ ${name}: ${(err as Error).message}`);
    }
  }
  const configured = new Set(results.map(([n]) => n));
  for (const name of ["Anthropic", "Gmail", "Notion", "Telegram"]) {
    if (!configured.has(name)) console.log(`⚪ ${name}: not configured (dry-run)`);
  }
} else {
  console.error(`Unknown command "${cmd}". Use telegram, notion, or check.`);
  process.exit(1);
}
