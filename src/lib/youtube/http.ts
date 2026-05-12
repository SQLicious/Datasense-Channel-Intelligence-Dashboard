import type { YoutubeCredentials } from "./types";

const youtubeBaseUrl = "https://www.googleapis.com/youtube/v3";

export class YoutubeApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "YoutubeApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function youtubeFetch<T>(
  resource: string,
  params: Record<string, string | number | boolean | undefined>,
  credentials: YoutubeCredentials
): Promise<T> {
  const url = new URL(`${youtubeBaseUrl}/${resource}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: HeadersInit = {};

  if (credentials.mode === "api_key") {
    url.searchParams.set("key", credentials.apiKey);
  } else {
    headers.Authorization = `Bearer ${credentials.accessToken}`;
  }

  const response = await fetch(url, { headers, cache: "no-store" });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : `YouTube API request failed with status ${response.status}`;

    throw new YoutubeApiError(response.status, message, body);
  }

  return body as T;
}
