import type { StoredComment, StoredVideo } from "./types";

export const COMMENT_INSIGHT_LIMIT = 200;

export type CommentIntent =
  | "Question"
  | "Content Request"
  | "Tool or Product Mention"
  | "Confusion or Friction"
  | "Business or Use Case"
  | "Praise"
  | "General Signal";

export type CommentInsightRow = {
  commentId: string;
  videoId: string;
  videoTitle: string;
  authorDisplayName: string;
  text: string;
  likeCount: number;
  publishedAt?: string;
  sourceUrl: string;
  theme: string;
  intent: CommentIntent;
  sentiment: "Positive" | "Negative" | "Mixed" | "Neutral";
  priority: "High" | "Medium" | "Low";
  recommendedAction: string;
  question: string;
};

export type PatternInsight = {
  name: string;
  count: number;
  share: number;
  priority: "High" | "Medium" | "Low";
  representativeComment: string;
  affectedVideos: string[];
  recommendedAction: string;
};

export type QuestionInsight = {
  question: string;
  count: number;
  theme: string;
  examples: string[];
  suggestedAnswerAngle: string;
  priority: "High" | "Medium";
};

export type ContentIdea = {
  idea: string;
  source: string;
  evidence: string;
  format: string;
  priority: "High" | "Medium";
};

export type VideoInsight = {
  videoId: string;
  title: string;
  commentCount: number;
  topTheme: string;
  topIntent: string;
  replyOpportunityCount: number;
  sourceUrl: string;
};

export type CommentInsights = {
  rows: CommentInsightRow[];
  totalComments: number;
  videosRepresented: number;
  questionRate: number;
  contentRequestRate: number;
  highPriorityUnanswered: number;
  themeMix: PatternInsight[];
  intentMix: PatternInsight[];
  replyOpportunities: PatternInsight[];
  frequentQuestions: QuestionInsight[];
  contentIdeas: ContentIdea[];
  videoInsights: VideoInsight[];
  topTools: PatternInsight[];
  whatThisMeans: string;
};

type Bucket = {
  count: number;
  examples: CommentInsightRow[];
  videos: Set<string>;
};

const THEME_KEYWORDS: Array<[string, string[]]> = [
  ["Agentic AI", ["agent", "agents", "agentic", "workflow", "automation", "langgraph", "crewai", "autogen"]],
  ["RAG and LLM Apps", ["rag", "retrieval", "llm", "vector", "embedding", "pinecone", "chroma", "knowledge base"]],
  ["Data Engineering", ["databricks", "spark", "pyspark", "sql", "pipeline", "etl", "delta", "warehouse", "data engineer"]],
  ["Career and Portfolio", ["career", "resume", "interview", "job", "portfolio", "linkedin", "salary", "hiring"]],
  ["Cloud and Deployment", ["azure", "aws", "gcp", "cloud", "vercel", "deploy", "production", "supabase"]],
  ["Learning Path", ["roadmap", "beginner", "learn", "course", "playlist", "step by step", "tutorial"]],
  ["Tools and Setup", ["install", "setup", "github", "api", "oauth", "environment", "notebook", "error", "tool"]],
  ["Content Feedback", ["thanks", "helpful", "great", "love", "clear", "confusing", "audio", "explain"]],
];

const TOOL_KEYWORDS = [
  "databricks",
  "pyspark",
  "sql",
  "python",
  "azure",
  "aws",
  "gcp",
  "supabase",
  "pinecone",
  "langgraph",
  "crewai",
  "ragas",
  "github",
  "vercel",
  "notebook",
  "excel",
  "power bi",
  "tableau",
];

const POSITIVE_WORDS = ["great", "thanks", "thank", "helpful", "excellent", "love", "amazing", "clear", "useful", "good"];
const NEGATIVE_WORDS = ["confused", "confusing", "stuck", "error", "problem", "issue", "hard", "unclear", "wrong", "failed"];

export function selectLatestTopLevelComments(comments: StoredComment[], limit = COMMENT_INSIGHT_LIMIT): StoredComment[] {
  return [...comments]
    .filter((comment) => !comment.isReply)
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")))
    .slice(0, limit);
}

export function buildCommentInsights(comments: StoredComment[], videos: StoredVideo[]): CommentInsights {
  const latestComments = selectLatestTopLevelComments(comments);
  const videoMap = new Map(videos.map((video) => [video.videoId, video]));
  const rows = latestComments.map((comment) => classifyComment(comment, videoMap.get(comment.videoId)));

  const themeMix = buildPatternInsights(rows, (row) => row.theme);
  const intentMix = buildPatternInsights(rows, (row) => row.intent);
  const replyOpportunities = buildPatternInsights(
    rows.filter((row) => row.priority === "High"),
    (row) => row.intent
  );
  const topTools = buildToolInsights(rows);
  const frequentQuestions = buildQuestionInsights(rows);
  const contentIdeas = buildContentIdeas(
    themeMix.filter((theme) => theme.name !== "General Audience Signal"),
    frequentQuestions
  );
  const videoInsights = buildVideoInsights(rows, videoMap);
  const totalComments = rows.length;
  const questionCount = rows.filter((row) => row.intent === "Question").length;
  const requestCount = rows.filter((row) => row.intent === "Content Request").length;
  const highPriorityUnanswered = rows.filter((row) => row.priority === "High" && ["Question", "Content Request", "Confusion or Friction"].includes(row.intent)).length;

  return {
    rows,
    totalComments,
    videosRepresented: new Set(rows.map((row) => row.videoId)).size,
    questionRate: totalComments ? questionCount / totalComments : 0,
    contentRequestRate: totalComments ? requestCount / totalComments : 0,
    highPriorityUnanswered,
    themeMix,
    intentMix,
    replyOpportunities,
    frequentQuestions,
    contentIdeas,
    videoInsights,
    topTools,
    whatThisMeans: buildSummary(themeMix, intentMix, frequentQuestions, totalComments),
  };
}

function classifyComment(comment: StoredComment, video?: StoredVideo): CommentInsightRow {
  const text = cleanText(comment.text);
  const theme = classifyTheme(text, video?.title || comment.videoTitle);
  const intent = classifyIntent(text);
  const sentiment = classifySentiment(text);
  const question = intent === "Question" ? normalizeQuestion(text) : "";
  const priority = classifyPriority(intent, comment.likeCount || 0, text);

  return {
    commentId: comment.commentId,
    videoId: comment.videoId,
    videoTitle: video?.title || comment.videoTitle,
    authorDisplayName: comment.authorDisplayName,
    text,
    likeCount: comment.likeCount || 0,
    publishedAt: comment.publishedAt,
    sourceUrl: `https://www.youtube.com/watch?v=${comment.videoId}&lc=${encodeURIComponent(comment.commentId)}`,
    theme,
    intent,
    sentiment,
    priority,
    recommendedAction: recommendedAction(theme, intent),
    question,
  };
}

function classifyTheme(text: string, title: string): string {
  const haystack = `${text} ${title}`.toLowerCase();
  const matches = THEME_KEYWORDS.map(([theme, keywords]) => ({
    theme,
    score: keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0),
  })).filter((item) => item.score > 0);

  return matches.sort((left, right) => right.score - left.score)[0]?.theme || "General Audience Signal";
}

function classifyIntent(text: string): CommentIntent {
  const lowered = text.toLowerCase();

  if (text.includes("?") || /\b(how|what|where|which|when|why|can you|could you|should i)\b/i.test(text)) {
    return "Question";
  }
  if (/\b(make|create|do|need|want|please|tutorial|video|playlist|roadmap|example|project)\b/i.test(text)) {
    return "Content Request";
  }
  if (TOOL_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    return "Tool or Product Mention";
  }
  if (/\b(confused|stuck|unclear|error|issue|problem|not working|don't understand|cant understand|can't understand)\b/i.test(text)) {
    return "Confusion or Friction";
  }
  if (/\b(company|business|client|team|enterprise|production|use case|project at work)\b/i.test(text)) {
    return "Business or Use Case";
  }
  if (POSITIVE_WORDS.some((word) => lowered.includes(word))) {
    return "Praise";
  }
  return "General Signal";
}

function classifySentiment(text: string): CommentInsightRow["sentiment"] {
  const lowered = text.toLowerCase();
  const positive = POSITIVE_WORDS.filter((word) => lowered.includes(word)).length;
  const negative = NEGATIVE_WORDS.filter((word) => lowered.includes(word)).length;

  if (positive && negative) return "Mixed";
  if (positive > negative) return "Positive";
  if (negative > positive) return "Negative";
  return "Neutral";
}

function classifyPriority(intent: CommentIntent, likes: number, text: string): CommentInsightRow["priority"] {
  const intentScore = ["Question", "Content Request", "Confusion or Friction", "Business or Use Case"].includes(intent) ? 3 : 0;
  const likeScore = Math.min(likes, 5);
  const lengthScore = text.length > 140 ? 1 : 0;
  const score = intentScore + likeScore + lengthScore;

  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

function buildPatternInsights(rows: CommentInsightRow[], getKey: (row: CommentInsightRow) => string): PatternInsight[] {
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const key = getKey(row);
    const bucket = buckets.get(key) || { count: 0, examples: [], videos: new Set<string>() };
    bucket.count += 1;
    bucket.videos.add(row.videoTitle);
    if (bucket.examples.length < 3) bucket.examples.push(row);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([name, bucket]): PatternInsight => ({
      name,
      count: bucket.count,
      share: rows.length ? bucket.count / rows.length : 0,
      priority: priorityForPattern(name, bucket.count, bucket.examples),
      representativeComment: bucket.examples[0]?.text || "",
      affectedVideos: [...bucket.videos].slice(0, 4),
      recommendedAction: recommendedAction(name, bucket.examples[0]?.intent || "General Signal"),
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function buildToolInsights(rows: CommentInsightRow[]): PatternInsight[] {
  const toolRows: CommentInsightRow[] = [];

  for (const row of rows) {
    const lowered = row.text.toLowerCase();
    for (const tool of TOOL_KEYWORDS) {
      if (lowered.includes(tool)) {
        toolRows.push({ ...row, theme: tool });
      }
    }
  }

  return buildPatternInsights(toolRows, (row) => row.theme).slice(0, 8);
}

function buildQuestionInsights(rows: CommentInsightRow[]): QuestionInsight[] {
  const buckets = new Map<string, { rows: CommentInsightRow[]; theme: string }>();

  for (const row of rows.filter((item) => item.question)) {
    const key = row.question;
    const bucket = buckets.get(key) || { rows: [], theme: row.theme };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([question, bucket]): QuestionInsight => ({
      question,
      count: bucket.rows.length,
      theme: bucket.theme,
      examples: bucket.rows.slice(0, 3).map((row) => row.text),
      suggestedAnswerAngle: suggestedAnswerAngle(bucket.theme, question),
      priority: bucket.rows.length > 1 || bucket.rows.some((row) => row.priority === "High") ? "High" : "Medium",
    }))
    .sort((left, right) => right.count - left.count || left.question.localeCompare(right.question))
    .slice(0, 10);
}

function buildContentIdeas(themes: PatternInsight[], questions: QuestionInsight[]): ContentIdea[] {
  const ideas: ContentIdea[] = themes.slice(0, 6).map((theme): ContentIdea => ({
    idea: suggestedThemeIdea(theme.name),
    source: theme.name,
    evidence: `${theme.count} comments, including: ${theme.representativeComment}`,
    format: formatForTheme(theme.name),
    priority: theme.priority === "High" ? "High" : "Medium",
  }));

  for (const question of questions.slice(0, 4)) {
    ideas.push({
      idea: question.suggestedAnswerAngle,
      source: question.theme,
      evidence: question.examples[0] || question.question,
      format: "Q&A or short explainer",
      priority: question.priority,
    });
  }

  return ideas.slice(0, 10);
}

function buildVideoInsights(rows: CommentInsightRow[], videos: Map<string, StoredVideo>): VideoInsight[] {
  const byVideo = new Map<string, CommentInsightRow[]>();

  for (const row of rows) {
    byVideo.set(row.videoId, [...(byVideo.get(row.videoId) || []), row]);
  }

  return [...byVideo.entries()]
    .map(([videoId, items]) => {
      const theme = buildPatternInsights(items, (row) => row.theme)[0]?.name || "General Audience Signal";
      const intent = buildPatternInsights(items, (row) => row.intent)[0]?.name || "General Signal";

      return {
        videoId,
        title: videos.get(videoId)?.title || items[0]?.videoTitle || videoId,
        commentCount: items.length,
        topTheme: theme,
        topIntent: intent,
        replyOpportunityCount: items.filter((row) => row.priority === "High").length,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .sort((left, right) => right.commentCount - left.commentCount)
    .slice(0, 10);
}

function buildSummary(themes: PatternInsight[], intents: PatternInsight[], questions: QuestionInsight[], totalComments: number): string {
  if (!totalComments) {
    return "No recent public top-level comments are available yet. Run a sync with the YouTube API key or Supabase configured.";
  }

  const topActionableTheme = themes.find((theme) => theme.name !== "General Audience Signal")?.name;
  const topIntent = intents.find((intent) => intent.name !== "General Signal")?.name || "general feedback";
  const questionSignal = questions.length ? `First action: answer "${questions[0].question}".` : "First action: scan the high-priority rows before planning new videos.";

  if (!topActionableTheme) {
    return `The newest ${totalComments} top-level comments are mostly broad reactions, not a clear content mandate. ${questionSignal} Treat generic praise as validation, not as a reason to make a new video.`;
  }

  return `The newest ${totalComments} top-level comments show demand around ${topActionableTheme}, with ${topIntent.toLowerCase()} as the strongest owner-action signal. ${questionSignal} Use this page to decide what to reply to now and what to turn into the next video.`;
}

function recommendedAction(theme: string, intent: CommentIntent | string): string {
  if (theme === "General Audience Signal" || intent === "General Signal") {
    return "No new video from this alone. Use it only as light validation unless it repeats with specific questions.";
  }
  if (theme === "Content Feedback" || intent === "Praise") {
    return "Acknowledge the viewer, then look for specific follow-up questions before changing the content plan.";
  }
  if (intent === "Question") return `Reply with a direct answer. If this repeats, make a short follow-up on ${theme}.`;
  if (intent === "Content Request") return `Add this to the video backlog as a scoped tutorial or segment on ${theme}.`;
  if (intent === "Confusion or Friction") return `Clarify the missing step, prerequisite, or setup issue in the next related video.`;
  if (intent === "Tool or Product Mention") return `Track this tool mention and consider a comparison or setup note if it keeps appearing.`;
  if (intent === "Business or Use Case") return `Turn this into an enterprise example with inputs, architecture, and expected output.`;
  return `Review examples and decide whether ${theme} deserves a reply, short, or full video.`;
}

function priorityForPattern(name: string, count: number, examples: CommentInsightRow[]): PatternInsight["priority"] {
  if (name === "General Audience Signal" || name === "General Signal" || name === "Praise" || name === "Content Feedback") {
    return count >= 30 ? "Medium" : "Low";
  }

  if (examples.some((row) => row.priority === "High") || count >= 10) return "High";
  if (count >= 3) return "Medium";
  return "Low";
}

function suggestedThemeIdea(theme: string): string {
  const ideas: Record<string, string> = {
    "Agentic AI": "Build a real agentic workflow from intake to production handoff",
    "RAG and LLM Apps": "Show a RAG app teardown with retrieval failures, fixes, and evaluation",
    "Data Engineering": "Create a production-style data engineering project with SQL, Spark, and quality checks",
    "Career and Portfolio": "Turn a senior data engineer skill into a portfolio-ready project",
    "Cloud and Deployment": "Deploy an AI/data app with the exact cloud setup and failure points",
    "Learning Path": "Create a beginner-to-working roadmap with checkpoints and projects",
    "Tools and Setup": "Make a setup and troubleshooting walkthrough for the toolchain",
    "Content Feedback": "Publish a focused Q&A answering recent viewer friction",
  };

  return ideas[theme] || `Create a focused explainer around ${theme}`;
}

function suggestedAnswerAngle(theme: string, question: string): string {
  const cleaned = question.replace(/[?.!]+$/, "");
  return `${cleaned}: practical answer with a ${theme} example`;
}

function formatForTheme(theme: string): string {
  if (["Agentic AI", "RAG and LLM Apps", "Data Engineering", "Tools and Setup"].includes(theme)) return "Hands-on tutorial";
  if (theme === "Career and Portfolio") return "Roadmap";
  if (theme === "Cloud and Deployment") return "Deployment walkthrough";
  return "Explainer";
}

function normalizeQuestion(text: string): string {
  const firstQuestion = text.includes("?") ? `${text.split("?")[0]}?` : text;
  return firstQuestion.replace(/\s+/g, " ").trim().slice(0, 180) || "Question-like comment";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
