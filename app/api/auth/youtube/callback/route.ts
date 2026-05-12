import { NextRequest, NextResponse } from "next/server";
import { getTargetHandle } from "../../../../../src/lib/env";
import { writeOwnerOAuthCookie } from "../../../../../src/lib/youtube/cookies";
import { exchangeYoutubeCode } from "../../../../../src/lib/youtube/oauth";
import { verifyOwnerCanAccessTargetChannel } from "../../../../../src/lib/youtube/owner";
import { syncYoutubeData } from "../../../../../src/lib/youtube/sync";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.json({ error: oauthError }, { status: 400 });
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing OAuth code or state." }, { status: 400 });
  }

  try {
    const token = await exchangeYoutubeCode(code, state);
    await verifyOwnerCanAccessTargetChannel(token.access_token);
    const result = await syncYoutubeData({
      accessMode: "owner_connected",
      maxVideos: 5,
      includeReplies: false,
      oauth: {
        refreshToken: token.refresh_token || "",
        accessToken: token.access_token,
        expiryDate: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined
      }
    });

    if (result.channel.handle !== getTargetHandle()) {
      return NextResponse.json(
        {
          error: "Connected channel did not match the configured target channel.",
          expected: getTargetHandle(),
          actual: result.channel.handle
        },
        { status: 400 }
      );
    }

    const response = NextResponse.redirect(new URL("/?connected=owner", request.url));
    writeOwnerOAuthCookie(response.cookies, {
      refreshToken: token.refresh_token || "",
      accessToken: token.access_token,
      expiryDate: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to finish YouTube OAuth."
      },
      { status: 500 }
    );
  }
}
