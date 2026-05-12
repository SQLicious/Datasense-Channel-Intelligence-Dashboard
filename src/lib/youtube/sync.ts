import { getOptionalEnv, getTargetHandle } from "../env";
import { youtubeFetch, YoutubeApiError } from "./http";
import { COMMENT_INSIGHT_LIMIT } from "./insights";
import { getOwnerAccessToken } from "./oauth";
import { readYoutubeStore, saveOAuth, saveSyncResult } from "./store";
import type { AccessMode, StoredChannel, StoredComment, StoredVideo, SyncWarning, YoutubeCredentials } from "./types";

type ChannelListResponse = {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      customUrl?: string;
      thumbnails?: Record<string, { url: string }>;
    };
    contentDetails: {
      relatedPlaylists: {
        uploads: string;
      };
    };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      videoCount?: string;
    };
  }>;
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    snippet: {
      resourceId: {
        videoId: string;
      };
    };
  }>;
};

type VideosResponse = {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url: string }>;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
};

type CommentSnippet = {
  authorDisplayName?: string;
  authorChannelId?: {
    value?: string;
  };
  textDisplay?: string;
  textOriginal?: string;
  likeCount?: number;
  moderationStatus?: string;
  publishedAt?: string;
  updatedAt?: string;
};

type CommentThreadsResponse = {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet: {
      channelId: string;
      videoId: string;
      totalReplyCount?: number;
      topLevelComment: {
        id: string;
        snippet: CommentSnippet;
      };
    };
    replies?: {
      comments?: Array<{
        id: string;
        snippet: CommentSnippet;
      }>;
    };
  }>;
};

type CommentsResponse = {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet: CommentSnippet;
  }>;
};

export type SyncOptions = {
  accessMode?: AccessMode;
  maxVideos?: number;
  maxComments?: number;
  includeReplies?: boolean;
  oauth?: {
    refreshToken: string;
    accessToken?: string;
    expiryDate?: number;
  };
};

export async function getActiveAccessMode(): Promise<AccessMode> {
  const store = await readYoutubeStore();
  return store.oauth?.refreshToken ? "owner_connected" : "public_only";
}

export async function syncYoutubeData(options: SyncOptions = {}) {
  const startedAt = new Date().toISOString();
  const accessMode = options.accessMode || (await getActiveAccessMode());
  const credentials = await getCredentials(accessMode, options.oauth);
  const warnings: SyncWarning[] = [];
  const handle = getTargetHandle();

  const channel = await fetchChannel(handle, credentials, accessMode);

  if (accessMode === "owner_connected") {
    await saveOAuth({ channelId: channel.channelId });
  }

  const videoIds = await fetchUploadVideoIds(channel.uploadsPlaylistId, credentials, options.maxVideos);
  const videos = await fetchVideos(videoIds, channel.channelId, credentials);
  const comments: StoredComment[] = [];
  const maxComments = options.maxComments ?? COMMENT_INSIGHT_LIMIT;
  let topLevelCommentsSeen = 0;

  for (const video of videos) {
    try {
      if (topLevelCommentsSeen >= maxComments) {
        break;
      }

      const videoComments = await fetchCommentsForVideo(
        video,
        channel.channelId,
        credentials,
        accessMode,
        options.includeReplies ?? false,
        maxComments - topLevelCommentsSeen
      );
      topLevelCommentsSeen += videoComments.filter((comment) => !comment.isReply).length;
      comments.push(...videoComments);
    } catch (error) {
      warnings.push({
        videoId: video.videoId,
        step: "comments",
        message: error instanceof Error ? error.message : "Unable to fetch comments."
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const store = await saveSyncResult({ channel, videos, comments, warnings, startedAt, finishedAt });

  return {
    channel,
    videosSeen: videos.length,
    commentsSeen: comments.length,
    warnings,
    accessMode,
    store
  };
}

async function getCredentials(accessMode: AccessMode, oauth?: SyncOptions["oauth"]): Promise<YoutubeCredentials> {
  if (accessMode === "owner_connected") {
    return {
      mode: "oauth",
      accessToken: await getOwnerAccessToken(oauth)
    };
  }

  const apiKey = getOptionalEnv("YOUTUBE_API_KEY");

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required for public YouTube sync.");
  }

  return {
    mode: "api_key",
    apiKey
  };
}

async function fetchChannel(handle: string, credentials: YoutubeCredentials, accessMode: AccessMode): Promise<StoredChannel> {
  const cleanHandle = handle.replace(/^@/, "");
  const response = await youtubeFetch<ChannelListResponse>(
    "channels",
    {
      part: "snippet,contentDetails,statistics",
      forHandle: cleanHandle,
      maxResults: 1
    },
    credentials
  );

  const channel = response.items?.[0];

  if (!channel) {
    throw new Error(`Could not resolve YouTube channel handle ${handle}.`);
  }

  return {
    accessMode,
    channelId: channel.id,
    handle,
    title: channel.snippet.title,
    description: channel.snippet.description,
    customUrl: channel.snippet.customUrl,
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
    viewCount: channel.statistics?.viewCount,
    subscriberCount: channel.statistics?.subscriberCount,
    hiddenSubscriberCount: channel.statistics?.hiddenSubscriberCount,
    videoCount: channel.statistics?.videoCount,
    thumbnailUrl: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
    connectedAt: accessMode === "owner_connected" ? new Date().toISOString() : undefined,
    fetchedAt: new Date().toISOString()
  };
}

async function fetchUploadVideoIds(playlistId: string, credentials: YoutubeCredentials, maxVideos?: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (!maxVideos || ids.length < maxVideos) {
    const remaining = maxVideos ? maxVideos - ids.length : 50;
    const response = await youtubeFetch<PlaylistItemsResponse>(
      "playlistItems",
      {
        part: "snippet,contentDetails",
        playlistId,
        maxResults: Math.min(50, remaining),
        pageToken
      },
      credentials
    );

    for (const item of response.items || []) {
      const videoId = item.snippet.resourceId.videoId;
      if (videoId) {
        ids.push(videoId);
      }
    }

    if (!response.nextPageToken) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  return ids;
}

async function fetchVideos(videoIds: string[], channelId: string, credentials: YoutubeCredentials): Promise<StoredVideo[]> {
  const videos: StoredVideo[] = [];
  const fetchedAt = new Date().toISOString();

  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    const response = await youtubeFetch<VideosResponse>(
      "videos",
      {
        part: "snippet,statistics,contentDetails",
        id: chunk.join(","),
        maxResults: 50
      },
      credentials
    );

    for (const item of response.items || []) {
      videos.push({
        channelId,
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        viewCount: item.statistics?.viewCount,
        likeCount: item.statistics?.likeCount,
        commentCount: item.statistics?.commentCount,
        duration: item.contentDetails?.duration,
        fetchedAt
      });
    }
  }

  return videos;
}

async function fetchCommentsForVideo(
  video: StoredVideo,
  channelId: string,
  credentials: YoutubeCredentials,
  accessMode: AccessMode,
  includeReplies: boolean,
  topLevelLimit?: number
): Promise<StoredComment[]> {
  const comments: StoredComment[] = [];
  let topLevelCommentsSeen = 0;
  let pageToken: string | undefined;

  while (true) {
    const response = await youtubeFetch<CommentThreadsResponse>(
      "commentThreads",
      {
        part: "snippet,replies",
        videoId: video.videoId,
        maxResults: 100,
        order: "time",
        textFormat: "plainText",
        pageToken
      },
      credentials
    ).catch((error) => {
      if (error instanceof YoutubeApiError && error.status === 403) {
        throw new Error(`Comments unavailable or permissions missing for "${video.title}".`);
      }

      throw error;
    });

    for (const item of response.items || []) {
      const topLevel = toStoredComment({
        accessMode,
        channelId,
        video,
        commentId: item.snippet.topLevelComment.id,
        snippet: item.snippet.topLevelComment.snippet,
        isReply: false
      });
      comments.push(topLevel);
      topLevelCommentsSeen += 1;

      if (topLevelLimit && topLevelCommentsSeen >= topLevelLimit) {
        break;
      }

      const embeddedReplies = item.replies?.comments || [];
      const totalReplyCount = item.snippet.totalReplyCount || 0;

      if (includeReplies && totalReplyCount > embeddedReplies.length) {
        comments.push(...(await fetchReplies(topLevel.commentId, video, channelId, credentials, accessMode)));
      } else if (includeReplies) {
        for (const reply of embeddedReplies) {
          comments.push(
            toStoredComment({
              accessMode,
              channelId,
              video,
              commentId: reply.id,
              parentCommentId: topLevel.commentId,
              snippet: reply.snippet,
              isReply: true
            })
          );
        }
      }
    }

    if (!response.nextPageToken) {
      break;
    }

    if (topLevelLimit && topLevelCommentsSeen >= topLevelLimit) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  return comments;
}

async function fetchReplies(
  parentCommentId: string,
  video: StoredVideo,
  channelId: string,
  credentials: YoutubeCredentials,
  accessMode: AccessMode
): Promise<StoredComment[]> {
  const replies: StoredComment[] = [];
  let pageToken: string | undefined;

  while (true) {
    const response = await youtubeFetch<CommentsResponse>(
      "comments",
      {
        part: "snippet",
        parentId: parentCommentId,
        maxResults: 100,
        textFormat: "plainText",
        pageToken
      },
      credentials
    );

    for (const item of response.items || []) {
      replies.push(
        toStoredComment({
          accessMode,
          channelId,
          video,
          commentId: item.id,
          parentCommentId,
          snippet: item.snippet,
          isReply: true
        })
      );
    }

    if (!response.nextPageToken) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  return replies;
}

function toStoredComment(input: {
  accessMode: AccessMode;
  channelId: string;
  video: StoredVideo;
  commentId: string;
  parentCommentId?: string;
  snippet: CommentSnippet;
  isReply: boolean;
}): StoredComment {
  return {
    accessMode: input.accessMode,
    channelId: input.channelId,
    videoId: input.video.videoId,
    videoTitle: input.video.title,
    commentId: input.commentId,
    parentCommentId: input.parentCommentId,
    authorDisplayName: input.snippet.authorDisplayName || "Unknown author",
    authorChannelId: input.snippet.authorChannelId?.value,
    text: input.snippet.textOriginal || input.snippet.textDisplay || "",
    likeCount: input.snippet.likeCount || 0,
    moderationStatus: input.snippet.moderationStatus,
    publishedAt: input.snippet.publishedAt,
    updatedAt: input.snippet.updatedAt,
    isReply: input.isReply,
    fetchedAt: new Date().toISOString()
  };
}
