import { randomBytes } from "node:crypto";
import { getRequiredEnv } from "../env";
import { consumeOAuthState, readYoutubeStore, saveOAuth, setOAuthState } from "./store";
import type { StoredOAuth } from "./types";

const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const youtubeScope = "https://www.googleapis.com/auth/youtube.force-ssl";

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function createYoutubeAuthUrl(): Promise<string> {
  const state = randomBytes(24).toString("hex");
  await setOAuthState(state, Date.now() + 10 * 60 * 1000);

  const url = new URL(googleAuthUrl);
  url.searchParams.set("client_id", getRequiredEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getRequiredEnv("YOUTUBE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", youtubeScope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeYoutubeCode(code: string, state: string): Promise<TokenResponse> {
  const validState = await consumeOAuthState(state);

  if (!validState) {
    throw new Error("Invalid or expired OAuth state.");
  }

  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: getRequiredEnv("YOUTUBE_REDIRECT_URI"),
      grant_type: "authorization_code"
    })
  });

  const body = (await response.json()) as TokenResponse & { error?: string; error_description?: string };

  if (!response.ok) {
    throw new Error(body.error_description || body.error || "Failed to exchange OAuth code.");
  }

  if (!body.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke app access and run OAuth again.");
  }

  await saveOAuth({
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiryDate: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
    scope: body.scope,
    tokenType: body.token_type,
    connectedAt: new Date().toISOString()
  });

  return body;
}

export async function getOwnerAccessToken(oauthOverride?: Partial<StoredOAuth>): Promise<string> {
  const store = await readYoutubeStore();
  const oauth = oauthOverride?.refreshToken ? oauthOverride : store.oauth;

  if (!oauth?.refreshToken) {
    throw new Error("Owner OAuth is not connected yet.");
  }

  if (oauth.accessToken && oauth.expiryDate && oauth.expiryDate > Date.now() + 60_000) {
    return oauth.accessToken;
  }

  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: oauth.refreshToken,
      grant_type: "refresh_token"
    })
  });

  const body = (await response.json()) as TokenResponse & { error?: string; error_description?: string };

  if (!response.ok) {
    throw new Error(body.error_description || body.error || "Failed to refresh YouTube access token.");
  }

  if (!oauthOverride?.refreshToken) {
    await saveOAuth({
      refreshToken: oauth.refreshToken,
      accessToken: body.access_token,
      expiryDate: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
      scope: body.scope || oauth.scope,
      tokenType: body.token_type || oauth.tokenType,
      connectedAt: oauth.connectedAt
    });
  }

  return body.access_token;
}
