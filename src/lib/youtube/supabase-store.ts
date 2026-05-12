import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_SYNC_WINDOW_MS } from "./sync-rate-limit";
import type { StoredChannel, StoredComment, StoredOAuth, StoredVideo, SyncWarning, YoutubeStore } from "./types";

type SyncRun = YoutubeStore["lastSync"];

let client: SupabaseClient | undefined;
const publicSyncStatePrefix = "public-sync:";

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });

  return client;
}

export async function readSupabaseStore(): Promise<YoutubeStore> {
  const supabase = getSupabase();
  const [{ data: channelRows, error: channelError }, { data: videoRows, error: videoError }, { data: commentRows, error: commentError }, { data: oauthRows, error: oauthError }, { data: syncRows, error: syncError }] =
    await Promise.all([
      supabase.from("youtube_channels").select("*").order("fetched_at", { ascending: false }).limit(1),
      supabase.from("youtube_videos").select("*").order("published_at", { ascending: false, nullsFirst: false }),
      supabase.from("youtube_comments").select("*").order("published_at", { ascending: false, nullsFirst: false }),
      supabase.from("youtube_oauth_tokens").select("*").eq("id", "owner").limit(1),
      supabase.from("youtube_sync_runs").select("*").order("finished_at", { ascending: false }).limit(1)
    ]);

  throwIfError(channelError);
  throwIfError(videoError);
  throwIfError(commentError);
  throwIfError(oauthError);
  throwIfError(syncError);

  return {
    channel: channelRows?.[0] ? channelFromRow(channelRows[0]) : undefined,
    videos: Object.fromEntries((videoRows || []).map((row) => [row.video_id, videoFromRow(row)])),
    comments: Object.fromEntries((commentRows || []).map((row) => [row.comment_id, commentFromRow(row)])),
    oauth: oauthRows?.[0] ? oauthFromRow(oauthRows[0]) : undefined,
    lastSync: syncRows?.[0] ? syncFromRow(syncRows[0]) : undefined
  };
}

export async function readSupabasePublicSyncAttempts(ipHash: string): Promise<string[]> {
  const prefix = `${publicSyncStatePrefix}${ipHash}:`;
  const now = Date.now();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("youtube_oauth_states").select("state, expires_at").like("state", `${prefix}%`);

  throwIfError(error);
  const rows = (data || []).filter((row: any) => Number(row.expires_at) > now);

  await supabase.from("youtube_oauth_states").delete().like("state", `${prefix}%`).lte("expires_at", now);

  return rows
    .map((row: any) => {
      const suffix = String(row.state || "").slice(prefix.length);
      const parsed = Number(suffix);
      return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
    })
    .filter((value: string | undefined): value is string => Boolean(value));
}

export async function saveSupabasePublicSyncAttempts(ipHash: string, attempts: string[]): Promise<void> {
  const prefix = `${publicSyncStatePrefix}${ipHash}:`;
  const supabase = getSupabase();

  await supabase.from("youtube_oauth_states").delete().like("state", `${prefix}%`);

  if (attempts.length === 0) {
    return;
  }

  const { error } = await supabase.from("youtube_oauth_states").insert(
    attempts.map((attempt) => {
      const parsed = Date.parse(attempt);
      return {
        state: `${prefix}${parsed}`,
        expires_at: parsed + PUBLIC_SYNC_WINDOW_MS,
      };
    })
  );

  throwIfError(error);
}

export async function setSupabaseOAuthState(state: string, expiresAt: number): Promise<void> {
  const { error } = await getSupabase().from("youtube_oauth_states").upsert({
    state,
    expires_at: expiresAt
  });
  throwIfError(error);
}

export async function consumeSupabaseOAuthState(state: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("youtube_oauth_states").select("*").eq("state", state).maybeSingle();
  throwIfError(error);

  await supabase.from("youtube_oauth_states").delete().eq("state", state);

  return Boolean(data && Number(data.expires_at) > Date.now());
}

export async function saveSupabaseOAuth(oauth: Partial<StoredOAuth>): Promise<void> {
  const store = await readSupabaseStore();
  const nextOAuth = {
    ...store.oauth,
    ...oauth
  };

  if (!oauth.refreshToken && store.oauth?.refreshToken) {
    nextOAuth.refreshToken = store.oauth.refreshToken;
  }

  const { error } = await getSupabase().from("youtube_oauth_tokens").upsert({
    id: "owner",
    refresh_token: nextOAuth.refreshToken || "",
    access_token: nextOAuth.accessToken,
    expiry_date: nextOAuth.expiryDate,
    scope: nextOAuth.scope,
    token_type: nextOAuth.tokenType,
    channel_id: nextOAuth.channelId,
    connected_at: nextOAuth.connectedAt,
    updated_at: new Date().toISOString()
  });

  throwIfError(error);
}

export async function saveSupabaseSyncResult(input: {
  channel: StoredChannel;
  videos: StoredVideo[];
  comments: StoredComment[];
  warnings: SyncWarning[];
  startedAt: string;
  finishedAt: string;
}): Promise<YoutubeStore> {
  const supabase = getSupabase();

  throwIfError(
    (
      await supabase.from("youtube_channels").upsert({
        channel_id: input.channel.channelId,
        access_mode: input.channel.accessMode,
        handle: input.channel.handle,
        title: input.channel.title,
        description: input.channel.description,
        custom_url: input.channel.customUrl,
        uploads_playlist_id: input.channel.uploadsPlaylistId,
        view_count: input.channel.viewCount,
        subscriber_count: input.channel.subscriberCount,
        hidden_subscriber_count: input.channel.hiddenSubscriberCount,
        video_count: input.channel.videoCount,
        thumbnail_url: input.channel.thumbnailUrl,
        connected_at: input.channel.connectedAt,
        fetched_at: input.channel.fetchedAt
      })
    ).error
  );

  if (input.videos.length > 0) {
    throwIfError(
      (
        await supabase.from("youtube_videos").upsert(
          input.videos.map((video) => ({
            channel_id: video.channelId,
            video_id: video.videoId,
            title: video.title,
            description: video.description,
            published_at: video.publishedAt,
            thumbnail_url: video.thumbnailUrl,
            view_count: video.viewCount,
            like_count: video.likeCount,
            comment_count: video.commentCount,
            duration: video.duration,
            fetched_at: video.fetchedAt
          }))
        )
      ).error
    );
  }

  if (input.comments.length > 0) {
    throwIfError(
      (
        await supabase.from("youtube_comments").upsert(
          input.comments.map((comment) => ({
            comment_id: comment.commentId,
            access_mode: comment.accessMode,
            channel_id: comment.channelId,
            video_id: comment.videoId,
            video_title: comment.videoTitle,
            parent_comment_id: comment.parentCommentId,
            author_display_name: comment.authorDisplayName,
            author_channel_id: comment.authorChannelId,
            text: comment.text,
            like_count: comment.likeCount,
            moderation_status: comment.moderationStatus,
            published_at: comment.publishedAt,
            updated_at: comment.updatedAt,
            is_reply: comment.isReply,
            fetched_at: comment.fetchedAt
          }))
        )
      ).error
    );
  }

  throwIfError(
    (
      await supabase.from("youtube_sync_runs").insert({
        access_mode: input.channel.accessMode,
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        videos_seen: input.videos.length,
        comments_seen: input.comments.length,
        warnings: input.warnings
      })
    ).error
  );

  return readSupabaseStore();
}

function channelFromRow(row: any): StoredChannel {
  return {
    accessMode: row.access_mode,
    channelId: row.channel_id,
    handle: row.handle,
    title: row.title,
    description: row.description || "",
    customUrl: row.custom_url,
    uploadsPlaylistId: row.uploads_playlist_id,
    viewCount: row.view_count,
    subscriberCount: row.subscriber_count,
    hiddenSubscriberCount: row.hidden_subscriber_count,
    videoCount: row.video_count,
    thumbnailUrl: row.thumbnail_url,
    connectedAt: row.connected_at,
    fetchedAt: row.fetched_at
  };
}

function videoFromRow(row: any): StoredVideo {
  return {
    channelId: row.channel_id,
    videoId: row.video_id,
    title: row.title,
    description: row.description || "",
    publishedAt: row.published_at,
    thumbnailUrl: row.thumbnail_url,
    viewCount: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    duration: row.duration,
    fetchedAt: row.fetched_at
  };
}

function commentFromRow(row: any): StoredComment {
  return {
    accessMode: row.access_mode,
    channelId: row.channel_id,
    videoId: row.video_id,
    videoTitle: row.video_title,
    commentId: row.comment_id,
    parentCommentId: row.parent_comment_id,
    authorDisplayName: row.author_display_name,
    authorChannelId: row.author_channel_id,
    text: row.text || "",
    likeCount: row.like_count || 0,
    moderationStatus: row.moderation_status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    isReply: row.is_reply,
    fetchedAt: row.fetched_at
  };
}

function oauthFromRow(row: any): StoredOAuth {
  return {
    refreshToken: row.refresh_token,
    accessToken: row.access_token,
    expiryDate: row.expiry_date,
    scope: row.scope,
    tokenType: row.token_type,
    channelId: row.channel_id,
    connectedAt: row.connected_at
  };
}

function syncFromRow(row: any): SyncRun {
  return {
    accessMode: row.access_mode,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    videosSeen: row.videos_seen,
    commentsSeen: row.comments_seen,
    warnings: row.warnings || []
  };
}

function throwIfError(error: { message?: string; code?: string; details?: string; hint?: string } | null): void {
  if (error) {
    const detail = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" | ");
    throw new Error(detail || "Supabase request failed.");
  }
}
