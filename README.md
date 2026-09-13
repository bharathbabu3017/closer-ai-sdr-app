# Closer: an AI SDR that works your inbound pipeline

**🎥 Demo video (2 min):** _link coming_

## 1. Project overview

Inbound leads go cold while they wait in a queue. Someone has to read each form, decide whether the lead is worth a call, research the company, write a personal reply, update the CRM and tell the team. Usually that happens hours or days later, if at all.

**Closer does all of that in about a minute, on its own.** When someone fills in your website form, Closer:

1. **Qualifies** the lead with Claude. It runs a few web searches to confirm the company exists, then scores the lead 0–100 against *your* ideal customer profile (written in plain English in `agent.config.yaml`).
2. **Routes** it:
   - 🔥 **Hot leads** get deep web research, a pre-call brief, a personalized meeting invite with proposed times, and an alert to the sales team.
   - 🌱 **Warm/cold leads** get a helpful reply with the most relevant material from your content library.
   - 🚫 **Spam** (vendors pitching you, job seekers, prompt-injection junk) is disqualified quietly.
3. **Keeps the CRM current.** Every lead gets a Notion row with its stage, score, summary and next action, updated as the pipeline moves.

```
Form ─▶ Claude qualify (+web search) ─▶ Notion CRM row
                    │
     ┌──────────────┼───────────────────────────┐
   hot            warm/cold                    spam
     │              │                            │
Claude research   Claude nurture email        DISQUALIFIED
(web search+fetch)  └▶ Gmail                    (Notion updated)
     │
Notion pre-call brief ─▶ Claude invite email ─▶ Gmail ─▶ Telegram alert (score, talking points, brief link)
```

## 2. External apps used

| App | How Closer uses it | Direction |
|-----|--------------------|-----------|
| **Gmail** | Sends the personalized invite or nurture email to the lead, from your address | write |
| **Notion** | CRM database: creates and updates a row per lead (stage, tier, score, summary, next action). Writes the researched **pre-call brief** into the lead's page (company, news, pains, talking points, discovery questions, risks, sources) | write + read |
| **Telegram** | Posts a hot-lead alert to the sales group with the score, top talking points, and a link to the Notion brief | write |
| **Web** (Claude web search + web fetch) | Checks the company during qualification, and does deep research for hot leads | read |
| **Any form** (Tally, Typeform, Webflow, custom) | Sends submissions to Closer's JSON webhook | inbound |

A single hot lead takes **7+ actions across 3 apps**: Notion create → Notion brief → Notion update → Gmail send → Telegram alert, plus the web research.

## 3. Setup

Requirements: Node 20+ and an Anthropic API key. Every app is optional; any app without keys runs in **dry-run** mode and logs what it would have done.

```bash
git clone <this repo> && cd <repo>
npm install
cp .env.example .env            # fill in the keys below
npm run dev                     # web app (:3000) + agent worker
npm run simulate hot            # send a sample lead; also: warm, cold, spam, or path/to/lead.json
```

**Integrations (about 10 minutes total):**

1. **Anthropic:** set `ANTHROPIC_API_KEY`.
2. **Gmail:**
   - Create an app password at myaccount.google.com/apppasswords.
   - Set `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
3. **Notion:**
   - Create an internal integration at notion.so/profile/integrations and set `NOTION_TOKEN`.
   - Create a page, open ••• → *Connections*, and add your integration.
   - Set `NOTION_PARENT_PAGE_ID` (the 32-character id at the end of the page URL).
   - Run `npm run setup notion`. It creates the **Closer Leads** database and prints `NOTION_DATABASE_ID`.
4. **Telegram:**
   - Create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`.
   - Add the bot to your sales group and send a message.
   - Run `npm run setup telegram` to print `TELEGRAM_CHAT_ID`.
5. Run `npm run setup check` to confirm every integration works.
6. Optional for demos: set `DEMO_REDIRECT_EMAIL`. The agent still reasons about the real lead, but every email is delivered to your inbox.

**Make it yours:** copy `agent.config.example.yaml` to `agent.config.yaml` and describe your company, ideal customer, score thresholds, tone and content library. That file is the agent's whole brief, and it's prompt-cached.

**Connect a real form:** point its webhook at `POST {APP_URL}/api/webhooks/lead?token={WEBHOOK_SECRET}` with a flat JSON body. Common field names (`email`, `work_email`, `full_name`, `company_name`, `job_title`, `message`...) are mapped automatically, and every field (including custom questions) is shown to Claude.

## 4. Reliability & how we tested it

**Design choices that make it dependable**
- **Deterministic control flow.** The pipeline is a state machine in code (`src/pipeline/stateMachine.ts`). Claude makes judgment calls inside each step, but never decides which transitions are legal, so the agent can't skip or loop stages.
- **Structured outputs everywhere.** Qualification and briefs come back through Zod-validated tool calls, and emails through structured outputs. Free-text parsing never drives an action.
- **Your thresholds beat the model's labels.** Claude returns a score, and *your config* maps it to a route. A lead the model calls "hot" at 65 still gets nurtured if your bar is 70.
- **Durable job queue with retries.** The webhook only stores the lead and enqueues a job, then responds right away. The worker retries failed jobs with exponential backoff (30s → 2m → 8m). After 3 failures the lead goes to `ERROR` with the reason on its timeline, never silently lost.
- **Idempotent steps.**
  - A retry never sends a second email: it checks for an already-sent message first.
  - It doesn't rebuild a brief that was already published.
  - Duplicate form submissions don't restart the pipeline.
- **Graceful degradation.** If Notion or Telegram is down, or research times out, the lead still gets its email. The failure is logged on the lead's timeline. Only the core decisions (qualify, compose, send) can fail a job.
- **Prompt-injection hardening.** Form contents and web pages are passed as clearly delimited third-party data, and the system prompt tells Claude never to follow instructions inside them. This is covered by an eval case.
- **Refusal fallback.** Server-side model fallback (`fallbacks: "default"`) is on, so a declined request is retried on a fallback model instead of stalling the pipeline.
- **Audit trail.** Every action is an event tagged with its app (`form`, `claude`, `gmail`, `notion`, `telegram`, `system`), including token usage and search counts.

**Automated tests** (`npm test`, 13 tests, stubbed Claude + in-memory SQLite)
- Hot lead → research → brief → invite → alert. The test asserts all apps are touched and the Telegram alert links the brief.
- Warm lead is nurtured with no team alert. Spam is disqualified with no email sent.
- A Notion outage doesn't block outreach. A research failure still sends the invite.
- A failing step retries with backoff, then the lead is marked `ERROR` after 3 attempts.
- Duplicate submissions are ignored. Config thresholds override the model's tier. Invalid stage transitions are rejected.
- Form field mapping and email HTML escaping.

**Live agent eval** (`npm run eval`, real Claude calls)

`evals/qualification.json` holds 8 labeled leads covering the realistic mix:
- clear buyers
- curious-but-early leads
- a pre-product founder
- a vague enterprise info-gatherer
- an SEO spammer
- a job seeker
- a **prompt-injection** submission that demands a score of 100

The eval runs the real qualification step and checks that each lead lands on the expected route (invite / nurture / disqualify). `npm run eval -- 3` repeats each case to measure consistency.

Latest run (`claude-opus-5`, all 8 cases in parallel):

```
✅ enterprise-vague        expected nurture    got nurture    score  18
✅ head-of-data-bigquery   expected invite     got invite     score  76
✅ job-seeker              expected disqualify got disqualify score   2
✅ mixpanel-curious-growth expected nurture    got nurture    score  45
✅ pre-product-founder     expected nurture    got nurture    score   8
✅ prompt-injection        expected disqualify got disqualify score   0
✅ seo-agency-pitch        expected disqualify got disqualify score   0
❌ series-b-snowflake-demo expected invite     got nurture    score  65
Routing accuracy: 7/8 (88%)
```

The one miss is informative. The lead's company uses a placeholder `.example.com` domain, so the qualification web search couldn't verify it, and Claude docked points below our hot threshold of 70. In a second run of the same lead through the full pipeline it scored 85. So verification sensitivity near the threshold is the main source of variance. The next step is `npm run eval -- 5` to measure consistency and tune the rubric.

**Manual end-to-end (live apps):** `npm run simulate hot` with Notion and Telegram live produced this timeline:

```
[form    ] New simulator submission from Priya Raman
[system  ] NEW → QUALIFYING
[claude  ] Scored 85/100 (hot): VP Product at a ~300-person Series B SaaS, Snowflake in place, 6-8 week buying window...
[notion  ] CRM record updated (QUALIFYING)
[claude  ] Researched lead (6 web searches): ...
[notion  ] Pre-call brief written to Notion
[calcom  ] Found 3 open slots to propose
[claude  ] Drafted meeting invite: "Demo for LedgerLoop — funnels and retention on Snowflake"
[gmail   ] Emailed priya.raman@...: "Demo for LedgerLoop — funnels and retention on Snowflake"
[system  ] QUALIFYING → MEETING_INVITED
[notion  ] CRM record updated (MEETING_INVITED)
[telegram] Hot lead alert posted to sales group
```

**Bugs the live runs caught (and fixes):**
- The research step asked for a 32K output budget without streaming, and the SDK rejects that for long requests. Graceful degradation kept the invite going out without a brief. Fixed by capping it at 16K.
- The simulator exited on the stage change before the Telegram event was logged. Fixed by waiting for the event log to go quiet.

## Project structure

```
src/agent/        Claude steps: qualify, research, composeOutreach (+ prompts, Zod schemas)
src/pipeline/     state machine, runner, job queue with retries
src/adapters/     gmail, notion, telegram, dry-run (each app behind an interface)
src/leads/        webhook intake + field mapping
src/worker.ts     background agent worker
app/              Next.js webhook + API + leads page
scripts/          simulate, setup (notion/telegram/check), eval
evals/            labeled qualification cases
tests/            vitest suite
```

Built with TypeScript, Next.js, SQLite (Drizzle), and Claude (`claude-opus-5`) via the Anthropic SDK tool runner with web search and web fetch.
