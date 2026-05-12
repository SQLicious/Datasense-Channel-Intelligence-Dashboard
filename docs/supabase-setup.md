# Supabase Persistence Setup

Use Supabase Postgres as the durable app database for the YouTube dashboard.

## 1. Create a Supabase project

1. Open https://database.new
2. Create a project named `senseofdata-dashboard`.
3. Save the database password somewhere secure.

## 2. Create the tables

1. Open the Supabase project.
2. Go to **SQL Editor**.
3. Paste and run the SQL from `supabase/schema.sql`.

The schema enables Row Level Security and grants access only to the server-side
`service_role`. The browser should not read or write these tables directly.

## 3. Get server credentials

Go to **Project Settings > API** and copy:

- Project URL
- `service_role` key

Do not expose the service role key in browser code.

## 4. Add env vars locally and in Vercel

Add these to `.env.local`:

```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Add the same variables in Vercel Project Settings, or deploy with them as runtime env vars.

## 5. Why service role

The app writes owner OAuth tokens, sync runs, videos, and comments from server-side API routes only. Row Level Security is enabled, and the service role key bypasses RLS on the server. Never use this key in client components.

If the dashboard API returns `permission denied for table youtube_channels`,
re-run the grant section at the bottom of `supabase/schema.sql` in the SQL Editor.

## Tables created

- `youtube_channels`: one row per YouTube channel.
- `youtube_videos`: video catalog, stats, metadata, and publish dates.
- `youtube_comments`: top-level comments and replies.
- `youtube_oauth_tokens`: owner refresh/access token storage.
- `youtube_oauth_states`: short-lived OAuth CSRF state values.
- `youtube_sync_runs`: sync history, counts, and warnings.
- `youtube_comment_insights`: later AI summaries and audience themes.
- `youtube_video_topic_rollups`: later topic/sentiment rollups by video.
