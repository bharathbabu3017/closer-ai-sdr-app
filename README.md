# Closer

An autonomous sales pipeline agent. When a lead fills in your form, Closer qualifies it with Claude. Hot leads get a meeting invite. Everyone else gets tailored material and follow-ups. Once a call is booked, Closer researches the lead and writes a pre-call brief for the team.

> 🚧 Built in phases. **Phase 1 (done):** pipeline state machine, Claude qualification (with web search), and outreach drafting. All external apps run in dry-run mode for now.

## Apps it connects to

| App | What Closer does there | Status |
|-----|------------------------|--------|
| Form (Tally / Typeform / any JSON webhook) | Receives submissions | Generic JSON ✅ · Tally preset in Phase 2 |
| Gmail | Sends outreach and follow-ups, reads replies | Phase 2 |
| Cal.com | Proposes open slots, sends booking links, reacts to bookings | Phase 3 |
| Notion | Keeps a CRM row per lead, writes pre-call briefs | Phase 4 |
| Telegram | Alerts the sales group about hot leads and posts briefs | Phase 4 |

One hot lead touches all of them: form → Notion → Telegram → Cal.com → Gmail → Cal.com booking → web research → Notion brief → Telegram.

## Quickstart (dry run, only needs an Anthropic key)

```bash
npm install
cp .env.example .env                  # add ANTHROPIC_API_KEY
cp agent.config.example.yaml agent.config.yaml   # describe your company, ICP and materials
npm run dev                           # web app on :3000 + background worker
npm run simulate hot                  # also: warm, cold, spam, or a path to any JSON payload
```

`simulate` posts the fixture to the webhook, then streams the agent's timeline, e.g.:

```
[form    ] New simulator submission from Priya Raman
[system  ] NEW → QUALIFYING
[claude  ] Scored 86/100 (hot): Series B SaaS on Snowflake with an active evaluation...
[notion  ] CRM record updated (QUALIFYING)
[telegram] Hot lead alert posted to sales group
[calcom  ] Found 3 open slots to propose
[claude  ] Drafted meeting invite: "Self-serve funnels on LedgerLoop's Snowflake"
[gmail   ] Emailed priya.raman@ledgerloop.example.com: ...
[system  ] QUALIFYING → MEETING_INVITED
```

Open http://localhost:3000 to see the leads.

## Sending real leads

Point your form's webhook at:

```
POST {APP_URL}/api/webhooks/lead?token={WEBHOOK_SECRET}&source=website
Content-Type: application/json

{ "name": "...", "email": "...", "company": "...", "any_other_question": "..." }
```

Common field names (`email`, `work_email`, `full_name`, `first_name`/`last_name`, `company_name`, `job_title`, `website`, `message`...) are mapped automatically. Every field, including custom questions, reaches Claude.

## How it works

- **The pipeline is a state machine in code** (`src/pipeline/`). Claude makes the decisions inside each step (`src/agent/steps/`). Every step is retryable and writes to an event timeline.
- **The web app and worker share a SQLite database.** The webhook stores the lead and queues a job, and the worker (`src/worker.ts`) runs it with exponential-backoff retries.
- **Qualification** runs Claude's tool runner with web search to verify the company. The verdict comes back through a structured `submit_qualification` tool.
- **Outreach** uses structured outputs, so every draft has a subject, body, and the materials it cites.
- **Adapters** (`src/adapters/`) put each external app behind an interface. Dry-run implementations log instead of calling the app.

Pipeline stages: `NEW → QUALIFYING → MEETING_INVITED | NURTURING | DISQUALIFIED → MEETING_BOOKED → RESEARCHING → BRIEF_READY → DONE`

## Development

```bash
npm test          # vitest: pipeline with a stubbed agent, routing, intake mapping
npm run typecheck
npm run db:generate   # after changing src/db/schema.ts
```
