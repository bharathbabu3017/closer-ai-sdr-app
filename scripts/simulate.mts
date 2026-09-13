/**
 * Sends a fixture lead to the local webhook and follows it through the pipeline.
 *   npm run simulate hot            # fixtures/leads/hot.json
 *   npm run simulate path/to.json   # any flat JSON form payload
 */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const SETTLED = new Set(["DISQUALIFIED", "MEETING_INVITED", "NURTURING", "BRIEF_READY", "DONE", "ERROR"]);

const arg = process.argv[2] ?? "hot";
const file = fs.existsSync(arg) ? arg : path.join("fixtures/leads", `${arg}.json`);
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const token = process.env.WEBHOOK_SECRET;

const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const res = await fetch(`${baseUrl}/api/webhooks/lead?source=simulator`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { "x-webhook-token": token } : {}) },
  body: JSON.stringify(payload),
});
const body = await res.json();
if (!res.ok) {
  console.error(`Webhook rejected the lead (${res.status}):`, body);
  process.exit(1);
}
console.log(`→ Submitted ${path.basename(file)} as lead ${body.leadId}${body.duplicate ? " (duplicate email, pipeline not restarted)" : ""}\n`);

let seen = 0;
const deadline = Date.now() + 5 * 60_000;
while (Date.now() < deadline) {
  const detail = await (await fetch(`${baseUrl}/api/leads/${body.leadId}`)).json();
  for (const e of detail.events.slice(seen)) {
    console.log(`  [${e.app.padEnd(8)}] ${e.summary}`);
  }
  seen = detail.events.length;

  if (SETTLED.has(detail.lead.stage) && seen > 1) {
    const email = detail.messages.at(-1);
    if (email) console.log(`\n── Email sent ──\nSubject: ${email.subject}\n\n${email.bodyText}\n`);
    console.log(`Final stage: ${detail.lead.stage}`);
    process.exit(detail.lead.stage === "ERROR" ? 1 : 0);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.error("Timed out waiting for the pipeline. Is the worker running (npm run dev)?");
process.exit(1);
