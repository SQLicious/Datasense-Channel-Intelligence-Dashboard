export type AccessMode = "public_only" | "owner_connected";

export type StoredChannel = {
  accessMode: AccessMode;
  channelId: string;
  handle: string;
  title: string;
  description: string;
  customUrl?: string;
  uploadsPlaylistId: string;
  viewCount?: string;
  subscriberCount?: string;
  hiddenSubscriberCount?: boolean;
  videoCount?: string;
  thumbnailUrl?: string;
  connectedAt?: string;
  fetchedAt: string;
};

export type StoredVideo = {
  channelId: string;
  videoId: string;
  title: string;
  description: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  duration?: string;
  fetchedAt: string;
};

export type StoredComment = {
  accessMode: AccessMode;
  channelId: string;
  videoId: string;
  videoTitle: string;
  commentId: string;
  parentCommentId?: string;
  authorDisplayName: string;
  authorChannelId?: string;
  text: string;
  likeCount: number;
  moderationStatus?: string;
  publishedAt?: string;
  updatedAt?: string;
  isReply: boolean;
  fetchedAt: string;
};

export type StoredOAuth = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  channelId?: string;
  connectedAt?: string;
};

export type SyncWarning = {
  videoId?: string;
  step: string;
  message: string;
};

export type YoutubeStore = {
  channel?: StoredChannel;
  videos: Record<string, StoredVideo>;
  comments: Record<string, StoredComment>;
  publicSyncRateLimits?: Record<string, string[]>;
  oauth?: StoredOAuth;
  oauthState?: {
    state: string;
    expiresAt: number;
  };
  lastSync?: {
    accessMode: AccessMode;
    startedAt: string;
    finishedAt: string;
    videosSeen: number;
    commentsSeen: number;
    warnings: SyncWarning[];
  };
};

export type YoutubeCredentials =
  | {
      mode: "api_key";
      apiKey: string;
    }
  | {
      mode: "oauth";
      accessToken: string;
    };
