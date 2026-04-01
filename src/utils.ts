import type { Track } from "./types.ts";
import type { SearchResult, SearchProvider } from "./providers/base.ts";
import { enqueue, getQueueInfo } from "./services/queue.ts";
import type { ChatInputCommandInteraction } from "discord.js";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function replyWithTrackStatus(
  interaction: ChatInputCommandInteraction,
  track: Track,
  guildId: string,
) {
  const info = getQueueInfo(guildId);
  const isNowPlaying = info?.currentTrack?.youtubeUrl === track.youtubeUrl && info?.size === 0;

  if (isNowPlaying) {
    await interaction.editReply(
      `🎶 Now playing: **${track.title}** — ${track.artist} (${formatDuration(track.duration)})`,
    );
  } else {
    await interaction.editReply(
      `✅ Added to queue: **${track.title}** — ${track.artist} (${formatDuration(track.duration)})\n📋 Position in queue: ${info?.size ?? 1}`,
    );
  }
}

export async function enqueueMultiple(
  guildId: string,
  results: SearchResult[],
  provider: SearchProvider,
  userId: string,
) {
  let failed = 0;
  for (const result of results) {
    try {
      const track = await provider.resolve(result, userId);
      enqueue(guildId, track);
    } catch {
      failed++;
    }
  }
  return { added: results.length - failed, failed };
}

export function formatBulkAddReply(
  emoji: string,
  added: number,
  label: string,
  name: string,
  totalDuration: number,
  failed: number,
): string {
  let msg = `${emoji} Added **${added}** tracks from ${label} **${name}** (${formatDuration(totalDuration)})`;
  if (failed > 0) msg += `\n⚠️ ${failed} tracks couldn't be matched on YouTube`;
  return msg;
}
