# DataSense Channel Intelligence

DataSense Channel Intelligence is a production-oriented YouTube analytics dashboard for the [DataSense YouTube channel](https://www.youtube.com/@Senseofdata). It combines channel metadata, video and comment ingestion, audience-signal extraction, and operator-friendly sync controls in a Vercel-ready Next.js app.

This project was built completely in the Codex desktop app. The initial workflow was inspired by Nate Herk's [Master 97% of Codex in 1 Hour](https://www.youtube.com/watch?v=3TdD8Qv5Tk8) tutorial, then extended through hands-on iteration to ship a deployed working product in a single evening.

## What the app does today

- Surfaces channel-level context, freshness state, and dashboard metrics for the DataSense channel
- Supports two sync modes:
  - `public_only` for public YouTube data collection
  - `owner_connected` for channel-owner-authorized sync through Google OAuth
- Persists channel, video, comment, OAuth, and sync-run data in Supabase when configured
- Falls back to local JSON storage for development when Supabase is not configured
- Turns stored comment data into creator-facing insight views, including:
  - topic clusters
  - frequent viewer questions
  - content ideas
  - reply opportunities
  - raw comment review
- Loads a curated comment-insights snapshot for a stable dashboard presentation layer
- Deploys cleanly to Vercel with environment-based configuration

## Why this project exists

The goal is to make public YouTube content and engagement data usable for channel strategy, not just visible. Instead of stopping at raw metrics, the dashboard is structured to help answer practical questions:

- What are viewers repeatedly asking for?
- Which topics are creating the strongest engagement signal?
- Where are the best reply opportunities?
- What content ideas are directly supported by audience feedback?

## Stack

- Next.js 15
- React 19
- TypeScript
- Supabase for durable production storage
- YouTube Data API for channel, video, and comment ingestion
- Google OAuth for owner-authorized sync
- Vercel for deployment

## Architecture at a glance

The app currently has two complementary data paths:

1. **Operational sync path**
   - API routes trigger public or owner-authorized YouTube syncs
   - Data is stored in Supabase when server credentials are present
   - Local development can fall back to `data/youtube-store.json`

2. **Dashboard insight path**
   - A generated `data/comment-insights.json` snapshot powers the main dashboard experience
   - Snapshot data is derived from collected comment data and presented in a stable, reviewable format

This split keeps ingestion concerns separate from the dashboard UI and makes the app easier to operate and evolve.

## Local setup

Install dependencies:

```powershell
npm install
```

Create `.env.local` with the values you actually need:

```env
YOUTUBE_CHANNEL_HANDLE=@Senseofdata
YOUTUBE_API_KEY=your_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/youtube/callback
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Run locally:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

If the dashboard snapshot needs to be regenerated:

```powershell
npm run export:comments
```

## Deployment

The app is designed for Vercel deployment. Production durability depends on Supabase rather than local JSON storage.

Useful project docs:

- [docs/google-cloud-youtube-setup.md](/C:/Users/roopm/OneDrive/Documents/New%20project/docs/google-cloud-youtube-setup.md)
- [docs/supabase-setup.md](/C:/Users/roopm/OneDrive/Documents/New%20project/docs/supabase-setup.md)
- [docs/troubleshooting-runbook.md](/C:/Users/roopm/OneDrive/Documents/New%20project/docs/troubleshooting-runbook.md)
- [docs/developer-notes.md](/C:/Users/roopm/OneDrive/Documents/New%20project/docs/developer-notes.md)

## Planned upgrades

The next round of work is operational, not cosmetic:

- **Scheduled dashboard refreshes with Codex automations** so channel data and insights refresh automatically on a recurring cadence
- **Scheduled website performance routines with Codex automations** to regularly check deployment health and site responsiveness
- Further AI-assisted insight generation on top of the stored channel, video, and comment history
- Broader trend and content-gap reporting as the historical dataset matures

## Build note

This repository is also a practical record of what can be built end to end inside the Codex desktop app: ideation, implementation, debugging, deployment, and operational documentation in one workflow.
