import type { Track } from "./types.ts";
import type { SearchResult, SearchProvider } from "./providers/base.ts";
import type { GuildQueue } from "./services/queue.ts";
import type { ChatInputCommandInteraction } from "discord.js";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function replyWithTrackStatus(
  interaction: ChatInputCommandInteraction,
  track: Track,
  queue: GuildQueue,
) {
  const info = queue.getInfo();
  const isNowPlaying = info.currentTrack?.youtubeUrl === track.youtubeUrl && info.size === 0;

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
  queue: GuildQueue,
  results: SearchResult[],
  provider: SearchProvider,
  userId: string,
) {
  let failed = 0;
  for (const result of results) {
    try {
      const track = await provider.resolve(result, userId);
      queue.enqueue(track);
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
