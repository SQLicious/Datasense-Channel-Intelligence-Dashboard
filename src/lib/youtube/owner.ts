import { getTargetHandle } from "../env";
import { youtubeFetch } from "./http";
import { getOwnerAccessToken } from "./oauth";
import { saveOAuth } from "./store";

type ChannelListResponse = {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      customUrl?: string;
    };
  }>;
};

export async function verifyOwnerCanAccessTargetChannel(accessTokenOverride?: string): Promise<{ channelId: string; title: string }> {
  const accessToken = accessTokenOverride || (await getOwnerAccessToken());
  const targetHandle = getTargetHandle();
  const cleanHandle = targetHandle.replace(/^@/, "");

  const target = await youtubeFetch<ChannelListResponse>(
    "channels",
    {
      part: "snippet",
      forHandle: cleanHandle,
      maxResults: 1
    },
    { mode: "oauth", accessToken }
  );
  const targetChannel = target.items?.[0];

  if (!targetChannel) {
    throw new Error(`Could not resolve target channel ${targetHandle}.`);
  }

  const mine = await youtubeFetch<ChannelListResponse>(
    "channels",
    {
      part: "snippet",
      mine: true,
      maxResults: 50
    },
    { mode: "oauth", accessToken }
  );

  const ownedChannel = (mine.items || []).find((channel) => channel.id === targetChannel.id);

  if (!ownedChannel) {
    throw new Error(`The connected Google account does not own or manage ${targetHandle}.`);
  }

  await saveOAuth({ channelId: ownedChannel.id });

  return {
    channelId: ownedChannel.id,
    title: ownedChannel.snippet.title
  };
}
