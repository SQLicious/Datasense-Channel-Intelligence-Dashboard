import type { CommentInsightsSnapshot, ContentIdea, CountShare, CreatorInsight, ReplyOpportunity } from "./types";

export type DerivedCommentInsights = {
  tabBadges: Record<string, number>;
  nextMoves: string[];
  focusPattern?: CreatorInsight;
  topQuestion?: string;
  topIdea?: ContentIdea;
  highPriorityReplies: ReplyOpportunity[];
  categoryTotal: number;
};

export function deriveCommentInsights(snapshot: CommentInsightsSnapshot): DerivedCommentInsights {
  const focusPattern = snapshot.creatorInsights[0];
  const topQuestion = snapshot.frequentQuestions[0]?.questionTheme;
  const topIdea = snapshot.contentIdeas[0];
  const highPriorityReplies = snapshot.replyOpportunities.filter((item) => item.priority === "High");

  return {
    tabBadges: {
      Overview: snapshot.dashboard.metrics.commentsReviewed,
      Topics: snapshot.creatorInsights.length,
      Questions: snapshot.frequentQuestions.length,
      "Content Ideas": snapshot.contentIdeas.length,
      "Reply Queue": snapshot.replyOpportunities.length,
      "Raw Comments": snapshot.rawComments.length,
    },
    nextMoves: buildNextMoves(snapshot, focusPattern, topQuestion, topIdea, highPriorityReplies),
    focusPattern,
    topQuestion,
    topIdea,
    highPriorityReplies,
    categoryTotal: sumCounts(snapshot.dashboard.categoryMix),
  };
}

export function sumCounts(items: CountShare[]): number {
  return items.reduce((total, item) => total + Number(item.count || 0), 0);
}

function buildNextMoves(
  snapshot: CommentInsightsSnapshot,
  focusPattern: CreatorInsight | undefined,
  topQuestion: string | undefined,
  topIdea: ContentIdea | undefined,
  highPriorityReplies: ReplyOpportunity[]
) {
  const moves: string[] = [];

  if (topQuestion) {
    moves.push(`Answer the recurring "${topQuestion}" viewer need with a direct reply or short community post.`);
  }

  if (highPriorityReplies[0]) {
    moves.push(`Start with @${highPriorityReplies[0].author.replace(/^@/, "")}: ${highPriorityReplies[0].suggestedReplyAction}`);
  }

  if (topIdea) {
    moves.push(`Turn the highest-evidence idea into a video brief: ${topIdea.suggestedTitleAngle || topIdea.idea}.`);
  }

  if (focusPattern) {
    moves.push(`Use "${focusPattern.pattern}" as the main content planning signal, but validate it against specific comments.`);
  }

  if (!moves.length) {
    moves.push(`Review the latest ${snapshot.dashboard.metrics.commentsReviewed} comments and wait for repeated asks before changing the content plan.`);
  }

  return moves.slice(0, 4);
}
