import type { Track } from "./types.ts";
import type { SearchResult, SearchProvider } from "./providers/base.ts";
import type { GuildQueue } from "./services/queue.ts";
import { GuildMember, MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTrackSummary(track: Track): string {
  return `**${track.title}** — ${track.artist} (${formatDuration(track.duration)})`;
}

export function formatTrackCount(count: number): string {
  return `${count} track${count === 1 ? "" : "s"}`;
}

export function formatCommandReply(emoji: string, summary: string, detail?: string): string {
  return detail ? `${emoji} ${summary}\n${detail}` : `${emoji} ${summary}`;
}

export async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Only members in the bot's voice channel may control playback. Replies with an
 * ephemeral error and returns false otherwise.
 */
export async function ensureInBotChannel(
  interaction: ChatInputCommandInteraction,
  queue: GuildQueue,
): Promise<boolean> {
  const member = interaction.member;
  const channelId = member instanceof GuildMember ? member.voice.channelId : null;
  if (channelId === queue.voiceChannelId) return true;

  await replyEphemeral(
    interaction,
    formatCommandReply("⚠️", "Join my voice channel first.", `I'm in <#${queue.voiceChannelId}>.`),
  );
  return false;
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
      formatCommandReply("🎶", "Now playing.", formatTrackSummary(track)),
    );
  } else {
    await interaction.editReply(
      formatCommandReply(
        "✅",
        "Added to the queue.",
        `${formatTrackSummary(track)}\n📋 Position: ${info?.size ?? 1}`,
      ),
    );
  }
}

const RESOLVE_CONCURRENCY = 8;

// Resolves in ordered batches so playback can start after the first batch
export async function enqueueMultiple(
  queue: GuildQueue,
  results: SearchResult[],
  provider: SearchProvider,
  userId: string,
) {
  let failed = 0;
  for (let i = 0; i < results.length; i += RESOLVE_CONCURRENCY) {
    const batch = results.slice(i, i + RESOLVE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((result) => provider.resolve(result, userId)),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        queue.enqueue(outcome.value);
      } else {
        failed++;
      }
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
  let msg = formatCommandReply(
    emoji,
    `Added ${formatTrackCount(added)} from ${label}.`,
    `**${name}** (${formatDuration(totalDuration)})`,
  );
  if (failed > 0) {
    msg += `\n⚠️ ${formatTrackCount(failed)} couldn't be matched on YouTube.`;
  }
  return msg;
}
