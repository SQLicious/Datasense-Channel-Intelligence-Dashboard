import { NextRequest, NextResponse } from "next/server";
import { getTargetHandle } from "../../../../src/lib/env";
import { cookies } from "next/headers";
import { getClientIp, hashClientIp } from "../../../../src/lib/youtube/client-ip";
import { readOwnerOAuthCookie } from "../../../../src/lib/youtube/cookies";
import { getPublicSyncRateLimit } from "../../../../src/lib/youtube/sync-rate-limit";
import { readPublicSyncAttempts, readYoutubeStore } from "../../../../src/lib/youtube/store";

export async function GET(request: NextRequest) {
  const store = await readYoutubeStore();
  const ownerCookie = readOwnerOAuthCookie(await cookies());
  const oauthConnected = Boolean(store.oauth?.refreshToken || ownerCookie?.refreshToken);
  const ipHash = hashClientIp(getClientIp(request));
  const attempts = ipHash ? await readPublicSyncAttempts(ipHash) : [];
  const publicSyncRateLimit = getPublicSyncRateLimit(attempts, new Date().toISOString());

  return NextResponse.json({
    targetHandle: getTargetHandle(),
    publicConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    oauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI),
    oauthConnected,
    publicSyncRateLimit: {
      blocked: publicSyncRateLimit.blocked,
      retryAt: publicSyncRateLimit.retryAt,
      remainingAttempts: publicSyncRateLimit.remainingAttempts,
    },
    accessMode: store.lastSync?.accessMode || store.channel?.accessMode || "public_only",
    channel: store.channel,
    lastSync: store.lastSync,
    videoCount: Object.keys(store.videos).length,
    commentCount: Object.keys(store.comments).length
  });
}
