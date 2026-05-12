import { promises as fs } from "fs";
import path from "path";
import type { CommentInsightsSnapshot, SnapshotLoadResult } from "./types";

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "comment-insights.json");

export async function loadCommentInsightsSnapshot(): Promise<SnapshotLoadResult> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf-8");
    const snapshot = JSON.parse(raw) as CommentInsightsSnapshot;
    validateSnapshot(snapshot);
    return { status: "ready", snapshot };
  } catch (error) {
    return {
      status: "missing",
      message:
        error instanceof Error
          ? `Snapshot unavailable: ${error.message}. Run npm run export:comments.`
          : "Snapshot unavailable. Run npm run export:comments.",
    };
  }
}

function validateSnapshot(snapshot: CommentInsightsSnapshot) {
  if (!snapshot.dashboard?.metrics) {
    throw new Error("data/comment-insights.json is missing dashboard metrics");
  }
  if (!Array.isArray(snapshot.creatorInsights)) {
    throw new Error("data/comment-insights.json is missing creatorInsights");
  }
  if (!Array.isArray(snapshot.rawComments)) {
    throw new Error("data/comment-insights.json is missing rawComments");
  }
}
