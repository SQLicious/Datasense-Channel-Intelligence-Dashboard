import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredChannel, StoredComment, StoredOAuth, StoredVideo, SyncWarning, YoutubeStore } from "./types";
import {
  consumeSupabaseOAuthState,
  isSupabaseConfigured,
  readSupabasePublicSyncAttempts,
  readSupabaseStore,
  saveSupabasePublicSyncAttempts,
  saveSupabaseOAuth,
  saveSupabaseSyncResult,
  setSupabaseOAuthState
} from "./supabase-store";

const storePath =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "youtube-store.json")
    : path.join(process.cwd(), "data", "youtube-store.json");

const emptyStore = (): YoutubeStore => ({
  videos: {},
  comments: {}
});

export async function readYoutubeStore(): Promise<YoutubeStore> {
  if (isSupabaseConfigured()) {
    return readSupabaseStore();
  }

  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as YoutubeStore;

    return {
      ...emptyStore(),
      ...parsed,
      videos: parsed.videos || {},
      comments: parsed.comments || {}
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return emptyStore();
    }

    throw error;
  }
}

export async function readPublicSyncAttempts(ipHash: string): Promise<string[]> {
  if (isSupabaseConfigured()) {
    return readSupabasePublicSyncAttempts(ipHash);
  }

  const store = await readYoutubeStore();
  return store.publicSyncRateLimits?.[ipHash] || [];
}

export async function savePublicSyncAttempts(ipHash: string, attempts: string[]): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveSupabasePublicSyncAttempts(ipHash, attempts);
    return;
  }

  const store = await readYoutubeStore();
  store.publicSyncRateLimits = {
    ...(store.publicSyncRateLimits || {}),
    [ipHash]: attempts,
  };
  await writeYoutubeStore(store);
}

export async function writeYoutubeStore(store: YoutubeStore): Promise<void> {
  if (isSupabaseConfigured()) {
    throw new Error("Direct full-store writes are not supported for Supabase storage.");
  }

  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function setOAuthState(state: string, expiresAt: number): Promise<void> {
  if (isSupabaseConfigured()) {
    await setSupabaseOAuthState(state, expiresAt);
    return;
  }

  const store = await readYoutubeStore();
  store.oauthState = { state, expiresAt };
  await writeYoutubeStore(store);
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return consumeSupabaseOAuthState(state);
  }

  const store = await readYoutubeStore();
  const current = store.oauthState;
  delete store.oauthState;
  await writeYoutubeStore(store);

  return Boolean(current && current.state === state && current.expiresAt > Date.now());
}

export async function saveOAuth(oauth: Partial<StoredOAuth>): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveSupabaseOAuth(oauth);
    return;
  }

  const store = await readYoutubeStore();
  const nextOAuth = {
    ...store.oauth,
    ...oauth
  };

  if (!oauth.refreshToken && store.oauth?.refreshToken) {
    nextOAuth.refreshToken = store.oauth.refreshToken;
  }

  store.oauth = {
    refreshToken: nextOAuth.refreshToken || "",
    accessToken: nextOAuth.accessToken,
    expiryDate: nextOAuth.expiryDate,
    scope: nextOAuth.scope,
    tokenType: nextOAuth.tokenType,
    channelId: nextOAuth.channelId,
    connectedAt: nextOAuth.connectedAt
  };
  await writeYoutubeStore(store);
}

export async function saveSyncResult(input: {
  channel: StoredChannel;
  videos: StoredVideo[];
  comments: StoredComment[];
  warnings: SyncWarning[];
  startedAt: string;
  finishedAt: string;
}): Promise<YoutubeStore> {
  if (isSupabaseConfigured()) {
    return saveSupabaseSyncResult(input);
  }

  const store = await readYoutubeStore();

  store.channel = input.channel;

  for (const video of input.videos) {
    store.videos[video.videoId] = video;
  }

  for (const comment of input.comments) {
    store.comments[comment.commentId] = comment;
  }

  store.lastSync = {
    accessMode: input.channel.accessMode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    videosSeen: input.videos.length,
    commentsSeen: input.comments.length,
    warnings: input.warnings
  };
  await writeYoutubeStore(store);
  return store;
}
