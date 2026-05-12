import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readOwnerOAuthCookie } from "../../../../src/lib/youtube/cookies";
import { buildCommentInsights, selectLatestTopLevelComments } from "../../../../src/lib/youtube/insights";
import { readYoutubeStore } from "../../../../src/lib/youtube/store";

export async function GET() {
  const store = await readYoutubeStore();
  const ownerCookie = readOwnerOAuthCookie(await cookies());
  const videos = Object.values(store.videos).sort((left, right) =>
    String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""))
  );
  const comments = selectLatestTopLevelComments(Object.values(store.comments));
  const insights = buildCommentInsights(comments, videos);

  return NextResponse.json({
    channel: store.channel,
    videos,
    comments,
    insights,
    oauthConnected: Boolean(store.oauth?.refreshToken || ownerCookie?.refreshToken),
    lastSync: store.lastSync
  });
}
