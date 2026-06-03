# Clamor

AI memory layer for student communities.

Clamor is a full-stack product prototype for messy group chats. It keeps the lightweight feel of a GroupMe-style community, then adds structured memory: catch-up digests, action items, keyword alerts, source-backed Q&A, onboarding briefs, and community health signals.

## Why I Built It

Student organizations, clubs, class groups, and hackathon teams make decisions inside fast-moving chats, but the important parts disappear. Clamor explores a simple idea:

> Communities do not only need more messages. They need memory.

The product is framed around student/community groups because that is where existing tools often feel either too casual to preserve knowledge or too enterprise-heavy for everyday campus use.

## What It Does

- Turns chat history into a daily digest with decisions, blockers, tasks, and resources.
- Answers questions over saved community messages with source cards.
- Extracts action items and deadlines from conversation.
- Watches for configured keywords and creates alerts.
- Supports public, private, and moderator-only channels.
- Provides role-aware posting and invite flows.
- Includes a presenter/strategy page for explaining the market, cost model, and product wedge.
- Works without an API key using a local rule-based analyzer.
- Can use Groq from the backend for higher-value AI calls when configured.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js HTTP server
- Data: JSON seed/store files for prototype persistence
- AI architecture: local fallback analyzer plus optional Groq backend calls
- Deployment: Render-ready `render.yaml`

## Skills Demonstrated

- Full-stack product development with client, server, routing, and local persistence.
- AI product design for summaries, Q&A, alerts, onboarding, and reporting.
- RAG-style thinking: source-backed answers, scoped retrieval, and evidence cards.
- UX/UI design for a Slack/Discord-inspired but student-community-focused workflow.
- Backend API design for messages, imports, invites, roles, reports, asks, and overviews.
- Data modeling for communities, channels, members, roles, invites, messages, actions, alerts, and metrics.
- Product strategy: defining a wedge, market positioning, judge objections, and demo storytelling.
- Cost-aware AI design by using local logic for lightweight analysis and reserving LLM calls for high-value tasks.

## Project Structure

```text
.
|-- app.js                  # Frontend state and interaction logic
|-- server.js               # Node backend and API routes
|-- index.html              # Main product interface
|-- styles.css              # Main app styling
|-- strategy.html           # Pitch/strategy page
|-- strategy.css
|-- data/seed.json          # Demo community data
|-- render.yaml             # Render deployment config
`-- package.json
```

## Run Locally

Install Node 18+.

```bash
npm start
```

Then open:

```text
http://localhost:5173
```

If the port is busy:

```bash
node server.js 5174
```

## Optional Groq Setup

Create a `.env` file:

```text
AI_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.1-8b-instant
```

The API key stays on the backend. If Groq is not configured or fails, the app falls back to the local analyzer.

## Demo Flow

1. Open the product and show the messy student community chat.
2. Open Digest to show decisions, blockers, tasks, and resources.
3. Ask: `What decisions were made about funding?`
4. Point to the source cards that make the answer trustworthy.
5. Open Watch/Alerts to show keyword monitoring.
6. Open Members to show invites and role-aware permissions.
7. Open `strategy.html` to explain the GroupMe wedge, Slack comparison, privacy, and AI cost strategy.

## What I Would Highlight

Resume version:

> Built Clamor, a full-stack AI community messaging prototype that turns noisy student group chats into structured memory through daily digests, action extraction, keyword alerts, onboarding briefs, and source-backed Q&A.

Technical version:

> Designed a local-first AI intelligence layer that keeps lightweight analysis cheap and reserves LLM calls for high-value summaries, reports, and source-backed answers.

Product version:

> Positioned Clamor as an AI memory layer for campus communities that already rely on GroupMe-style chats but lose decisions, tasks, and context in the message stream.

## Deployment

This project is ready for Render.

Use:

```text
Runtime: Node
Build command: leave blank
Start command: npm start
Health check path: /api/health
```

For a production version, replace JSON storage with Supabase or Postgres so hosted data persists across server restarts.
