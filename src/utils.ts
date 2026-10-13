import type { Track } from "./types.ts";
import type { SearchResult, SearchProvider } from "./providers/base.ts";
import type { GuildQueue } from "./services/queue.ts";
import { GuildMember, MessageFlags } from "discord.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RepliableInteraction,
} from "discord.js";
import type { QueueManager } from "./services/queue.ts";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parses "90", "1:30" or "1:02:03" into seconds; null if invalid. */
export function parseTimestamp(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;

  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function progressBar(current: number, total: number, length = 14): string {
  const filled = total > 0 ? Math.min(Math.round((current / total) * length), length) : 0;
  const empty = length - filled;
  return `${formatDuration(current)} ▓${"█".repeat(filled)}${"░".repeat(empty)}▓ ${formatDuration(total)}`;
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
  interaction: RepliableInteraction,
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
  interaction: RepliableInteraction,
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

const MAX_AUTOCOMPLETE_CHOICES = 25;

/**
 * Suggests upcoming queue positions for an integer option, matching what was
 * typed against either the position or the track's title and artist.
 */
export async function autocompleteQueuePosition(
  interaction: AutocompleteInteraction,
  manager: QueueManager,
): Promise<void> {
  const queue = interaction.guildId ? manager.get(interaction.guildId) : undefined;
  const typed = String(interaction.options.getFocused()).trim().toLowerCase();

  const choices = (queue?.tracks ?? [])
    .map((track, i) => ({ track, position: i + 1 }))
    .filter(
      ({ track, position }) =>
        !typed ||
        String(position).startsWith(typed) ||
        track.title.toLowerCase().includes(typed) ||
        track.artist.toLowerCase().includes(typed),
    )
    .slice(0, MAX_AUTOCOMPLETE_CHOICES)
    .map(({ track, position }) => ({
      name: `${position}. ${track.title} — ${track.artist}`.slice(0, 100),
      value: position,
    }));

  await interaction.respond(choices);
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

export interface BulkEnqueueResult {
  added: number;
  failed: number;
  stopped: boolean;
}

// Resolves in ordered batches so playback can start after the first batch.
// Stops early if the queue is torn down (e.g. /stop) while loading.
export async function enqueueMultiple(
  queue: GuildQueue,
  results: SearchResult[],
  provider: SearchProvider,
  userId: string,
): Promise<BulkEnqueueResult> {
  let added = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i += RESOLVE_CONCURRENCY) {
    if (queue.isDestroyed()) return { added, failed, stopped: true };

    const batch = results.slice(i, i + RESOLVE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((result) => provider.resolve(result, userId)),
    );

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        failed++;
      } else if (!queue.isDestroyed()) {
        queue.enqueue(outcome.value);
        added++;
      }
    }
  }
  return { added, failed, stopped: queue.isDestroyed() };
}

export function formatBulkAddReply(
  emoji: string,
  label: string,
  name: string,
  totalDuration: number,
  { added, failed, stopped }: BulkEnqueueResult,
): string {
  if (stopped) {
    return formatCommandReply(
      "⏹️",
      `Stopped loading ${label}.`,
      `**${name}**: playback was stopped after adding ${formatTrackCount(added)}.`,
    );
  }

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
