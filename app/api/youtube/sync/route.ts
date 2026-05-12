import { NextRequest, NextResponse } from "next/server";
import { readOwnerOAuthCookie } from "../../../../src/lib/youtube/cookies";
import { syncYoutubeData } from "../../../../src/lib/youtube/sync";
import type { AccessMode } from "../../../../src/lib/youtube/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      accessMode?: AccessMode;
      maxVideos?: number;
      maxComments?: number;
      includeReplies?: boolean;
    };

    const result = await syncYoutubeData({
      accessMode: body.accessMode,
      maxVideos: parseMaxVideos(body.maxVideos),
      maxComments: parseMaxComments(body.maxComments),
      includeReplies: body.includeReplies,
      oauth: body.accessMode === "owner_connected" ? readOwnerOAuthCookie(request.cookies) : undefined
    });

    return NextResponse.json({
      accessMode: result.accessMode,
      channel: result.channel,
      videosSeen: result.videosSeen,
      commentsSeen: result.commentsSeen,
      warnings: result.warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to sync YouTube data."
      },
      { status: 500 }
    );
  }
}

function parseMaxVideos(value: number | undefined): number | undefined {
  if (!value || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(1, Math.floor(value));
}

function parseMaxComments(value: number | undefined): number | undefined {
  if (!value || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(5000, Math.max(1, Math.floor(value)));
}
