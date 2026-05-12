# Project Instructions

## Owner Context

The project owner is Roopmathi "Ruby" Gunna, a senior data engineer based in Jersey City, NJ.

Relevant background:

- 10+ years of IT and data experience across banking, cybersecurity, risk technology, healthcare, supply chain, and enterprise analytics.
- Strong practical experience with Azure Databricks, PySpark, SQL, Delta Lake, Unity Catalog, medallion architecture, metadata-driven ETL, CI/CD, and governed data platforms.
- Current portfolio direction is enterprise AI/data engineering: RAG, Agentic RAG, Text-to-SQL, LangGraph, RAGAS evaluation, knowledge graphs, and LLM-powered workflow automation.
- Existing project style favors production-oriented prototypes rather than toy demos: FastAPI, proper ingestion pipelines, evaluation, citations, data quality, and deployment readiness.

## Project Goal

Build a YouTube analytics dashboard for the channel:

https://www.youtube.com/@Senseofdata

The finished dashboard should be deployable to Vercel and should help analyze the channel's public content and audience engagement.

The dashboard should eventually include:

- Channel-level overview: name, description, subscriber count, video count, view count, and publishing cadence.
- Video catalog: titles, publish dates, descriptions, durations, views, likes, comments, and URLs.
- Comment analytics: comment volume, sentiment, recurring topics, frequent questions, audience pain points, and high-signal viewer feedback.
- Content analytics: themes, keywords, topic clusters, title patterns, performance by content type, and possible content gaps.
- Trend views: views over time, engagement over time, top videos, underperforming videos, and recent momentum.
- AI-assisted insights: summaries of what viewers ask for, suggested next videos, and reusable content strategy notes.

## Build Direction

Start small and make the project useful before adding heavy automation.

Recommended initial milestones:

1. Create a basic Vercel-ready web app.
2. Add a simple dashboard layout with placeholder metrics.
3. Connect to YouTube data through the YouTube Data API or another approved ingestion path.
4. Pull channel metadata and recent video metadata.
5. Add comment ingestion for selected videos.
6. Store fetched data locally first, then choose a hosted database if needed.
7. Add analytics views and AI summaries after the raw data flow is reliable.

## Technical Preferences

Use pragmatic, production-friendly choices:

- Frontend: Next.js or a Vercel-friendly React framework.
- Styling: clean dashboard UI, dense but readable, not a marketing landing page.
- Data fetching: typed API utilities with clear error handling.
- Storage: start with local JSON or SQLite for development; move to Postgres/Supabase/Neon only when needed.
- AI analysis: keep prompts and analysis functions isolated from UI components.
- Secrets: never hard-code API keys. Use `.env.local` for local development and Vercel environment variables for deployment.

## Agent Behavior

When working in this project:

- Preserve this file as the project source of context.
- Treat `https://www.youtube.com/@Senseofdata` as the target channel unless the user changes it.
- Prefer concrete implementation over generic explanation.
- Before adding new packages or frameworks, inspect the repo and follow the existing stack.
- If no stack exists yet, choose a minimal Vercel-ready setup.
- Keep dashboards practical and information-dense.
- Do not build a generic landing page unless explicitly requested.
- Do not expose personal contact details or private resume details in the app.
- Ask for API keys only when a task actually requires live YouTube data.

## Near-Term Next Step

Create the initial app skeleton and first dashboard screen, then wire a YouTube channel metadata fetcher once credentials or an approved public-data approach is available.

## Known Local Dev Issue

This project is on a Windows OneDrive path. Next.js can leave a locked `.next\trace` file when the dev server is running or has crashed. When that happens, `npm run build` may fail with:

```text
EPERM: operation not permitted, open '...\New project\.next\trace'
```

A related stale TypeScript artifact can also make `npm run typecheck` fail with missing `.next/types/...` files from `tsconfig.tsbuildinfo`.

When this happens, do this before rerunning verification:

1. Stop only this project's Node/Next dev processes.
2. Delete generated artifacts: `.next` and `tsconfig.tsbuildinfo`.
3. Run `npm run build` first so Next regenerates `.next/types`.
4. Run `npm run typecheck`.
5. Restart `npm run dev`.

Do not treat this as an application-code bug unless it persists after the generated artifacts are cleared.

## Troubleshooting Runbook

Detailed issue history and resolutions for this project live in:

```text
docs/troubleshooting-runbook.md
```

Use that file before re-debugging Supabase permissions, Vercel env vars, owner OAuth state, YouTube sync limits, disabled comments, duplicate protection, or Excel report generation/layout issues.
