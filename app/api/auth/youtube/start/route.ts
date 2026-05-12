import { NextResponse } from "next/server";
import { createYoutubeAuthUrl } from "../../../../../src/lib/youtube/oauth";

export async function GET() {
  try {
    const url = await createYoutubeAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to start YouTube OAuth."
      },
      { status: 500 }
    );
  }
}
