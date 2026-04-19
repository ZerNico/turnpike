import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command, Track } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatDuration } from "../utils.ts";

function progressBar(current: number, total: number, length = 14): string {
  const filled = total > 0 ? Math.round((current / total) * length) : 0;
  const empty = length - filled;
  return `${formatDuration(current)} ▓${"█".repeat(filled)}${"░".repeat(empty)}▓ ${formatDuration(total)}`;
}

function trackLine(index: number, track: Track): string {
  return `**${index}.** [${track.title}](${track.url}) — ${track.artist} (${formatDuration(track.duration)})`;
}

const TRACKS_PER_PAGE = 10;

export const queueCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the current music queue")
    .addIntegerOption((option) =>
      option.setName("page").setDescription("Page number").setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = queueManager.get(interaction.guildId);
    const info = queue?.getInfo();

    if (!info || (!info.currentTrack && info.size === 0)) {
      await interaction.reply({
        content: "The queue is empty. Use `/play` to add some tracks!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const totalTracks = info.size;
    const totalPages = Math.max(1, Math.ceil(totalTracks / TRACKS_PER_PAGE));
    const page = Math.min(interaction.options.getInteger("page") ?? 1, totalPages);

    const embed = new EmbedBuilder().setTitle("Music Queue").setColor(0x5865f2);

    if (info.currentTrack) {
      const bar = progressBar(info.playbackSeconds, info.currentTrack.duration);
      embed.addFields({
        name: "🎶 Now Playing",
        value: `[${info.currentTrack.title}](${info.currentTrack.url}) — ${info.currentTrack.artist}\n\`${bar}\``,
      });
    }

    if (totalTracks > 0) {
      const start = (page - 1) * TRACKS_PER_PAGE;
      const end = Math.min(start + TRACKS_PER_PAGE, totalTracks);
      const pageTracks = info.upcoming.slice(start, end);

      const lines = pageTracks.map((track, i) => trackLine(start + i + 1, track));

      embed.addFields({
        name: `📋 Up Next (${totalTracks} track${totalTracks === 1 ? "" : "s"})`,
        value: lines.join("\n"),
      });

      if (totalPages > 1) {
        embed.setFooter({ text: `Page ${page}/${totalPages} · Use /queue page:N to navigate` });
      }
    }

    const totalSeconds =
      (info.currentTrack?.duration ?? 0) + info.upcoming.reduce((sum, t) => sum + t.duration, 0);
    embed.addFields({
      name: "⏱️ Total Duration",
      value: formatDuration(totalSeconds),
      inline: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
