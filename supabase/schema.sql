create table if not exists youtube_channels (
  channel_id text primary key,
  access_mode text not null,
  handle text not null,
  title text not null,
  description text not null default '',
  custom_url text,
  uploads_playlist_id text not null,
  view_count text,
  subscriber_count text,
  hidden_subscriber_count boolean,
  video_count text,
  thumbnail_url text,
  connected_at timestamptz,
  fetched_at timestamptz not null
);

create table if not exists youtube_videos (
  video_id text primary key,
  channel_id text not null references youtube_channels(channel_id) on delete cascade,
  title text not null,
  description text not null default '',
  published_at timestamptz,
  thumbnail_url text,
  view_count text,
  like_count text,
  comment_count text,
  duration text,
  fetched_at timestamptz not null
);

create table if not exists youtube_comments (
  comment_id text primary key,
  access_mode text not null,
  channel_id text not null references youtube_channels(channel_id) on delete cascade,
  video_id text not null,
  video_title text not null,
  parent_comment_id text,
  author_display_name text not null,
  author_channel_id text,
  text text not null default '',
  like_count integer not null default 0,
  moderation_status text,
  published_at timestamptz,
  updated_at timestamptz,
  is_reply boolean not null default false,
  fetched_at timestamptz not null
);

create table if not exists youtube_oauth_tokens (
  id text primary key default 'owner',
  refresh_token text not null,
  access_token text,
  expiry_date bigint,
  scope text,
  token_type text,
  channel_id text,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists youtube_oauth_states (
  state text primary key,
  expires_at bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists youtube_sync_runs (
  id bigserial primary key,
  access_mode text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  videos_seen integer not null,
  comments_seen integer not null,
  warnings jsonb not null default '[]'::jsonb
);

create table if not exists youtube_comment_insights (
  id bigserial primary key,
  channel_id text not null references youtube_channels(channel_id) on delete cascade,
  video_id text,
  scope text not null default 'channel',
  summary text not null,
  recurring_topics jsonb not null default '[]'::jsonb,
  frequent_questions jsonb not null default '[]'::jsonb,
  audience_pain_points jsonb not null default '[]'::jsonb,
  content_suggestions jsonb not null default '[]'::jsonb,
  model text,
  generated_at timestamptz not null default now()
);

create table if not exists youtube_video_topic_rollups (
  id bigserial primary key,
  channel_id text not null references youtube_channels(channel_id) on delete cascade,
  video_id text references youtube_videos(video_id) on delete cascade,
  topic text not null,
  keywords jsonb not null default '[]'::jsonb,
  sentiment text,
  comment_count integer not null default 0,
  generated_at timestamptz not null default now(),
  unique (video_id, topic)
);

create index if not exists youtube_videos_channel_id_idx on youtube_videos(channel_id);
create index if not exists youtube_comments_channel_id_idx on youtube_comments(channel_id);
create index if not exists youtube_comments_video_id_idx on youtube_comments(video_id);
create index if not exists youtube_comments_published_at_idx on youtube_comments(published_at desc);
create index if not exists youtube_comment_insights_channel_id_idx on youtube_comment_insights(channel_id);
create index if not exists youtube_video_topic_rollups_channel_id_idx on youtube_video_topic_rollups(channel_id);

alter table youtube_channels enable row level security;
alter table youtube_videos enable row level security;
alter table youtube_comments enable row level security;
alter table youtube_oauth_tokens enable row level security;
alter table youtube_oauth_states enable row level security;
alter table youtube_sync_runs enable row level security;
alter table youtube_comment_insights enable row level security;
alter table youtube_video_topic_rollups enable row level security;

-- Server-only API routes use the service role key. Keep RLS enabled for browser
-- clients, but grant the service role explicit table privileges in projects
-- where Supabase does not add them automatically.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
