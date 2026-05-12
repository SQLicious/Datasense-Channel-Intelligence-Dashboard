export type Priority = "High" | "Medium" | "Low" | string;

export type CountShare = {
  name: string;
  count: number;
  share?: number;
};

export type DashboardMetrics = {
  videosRepresented: number;
  commentsReviewed: number;
  highReplyOpportunities: number;
  topMentionedTool: string;
  skippedVideos: number;
};

export type DashboardSummary = {
  title: string;
  subtitle: string;
  metrics: DashboardMetrics;
  primaryPattern: string;
  categoryMix: CountShare[];
  priorityMix: CountShare[];
  topTools: CountShare[];
};

export type CreatorInsight = {
  pattern: string;
  count: number;
  share: number;
  affectedVideos: string[];
  representativeComments: string[];
  recommendedAction: string;
};

export type FrequentQuestion = {
  questionTheme: string;
  count: number;
  beginnerOrAdvanced: string;
  exampleQuestions: string[];
  suggestedAnswerAngle: string;
};

export type ContentIdea = {
  idea: string;
  evidenceCount: number;
  suggestedTitleAngle: string;
  priority: Priority;
  sourceComments: string[];
};

export type ReplyOpportunity = {
  priority: Priority;
  author: string;
  comment: string;
  video: string;
  reasonFlagged: string;
  suggestedReplyAction: string;
};

export type RawComment = {
  videoTitle: string;
  videoId: string;
  commentId: string;
  author: string;
  authorChannelId: string;
  text: string;
  likes: number;
  publishedAt: string;
  category: string;
  questionTheme: string;
  priority: Priority;
};

export type CommentInsightsSnapshot = {
  brand: {
    name: string;
    channelUrl: string;
    iconUrl: string;
  };
  channelStats?: {
    videosUploaded?: number;
    commentsStored?: number;
    totalChannelViews?: number;
    subscribers?: number | "Hidden";
  };
  channelProfile?: {
    title: string;
    description: string;
    thumbnailUrl: string;
    accessMode: string;
  };
  syncStatus?: {
    currentMode: string;
    oauthConnected: boolean;
    lastSyncFinishedAt: string;
    videosSeen: number;
    commentsSeen: number;
    warnings: number;
  };
  source: {
    workbook: string;
    generatedBy: string;
  };
  dashboard: DashboardSummary;
  creatorInsights: CreatorInsight[];
  frequentQuestions: FrequentQuestion[];
  contentIdeas: ContentIdea[];
  replyOpportunities: ReplyOpportunity[];
  rawComments: RawComment[];
};

export type SnapshotLoadResult =
  | {
      status: "ready";
      snapshot: CommentInsightsSnapshot;
    }
  | {
      status: "missing";
      message: string;
    };
