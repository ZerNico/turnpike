import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { getQueue, skip } from "../services/queue.ts";
import { formatDuration } from "../utils.ts";

export const skipCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current track (or multiple)")
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("Number of tracks to skip (default: 1)")
        .setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = getQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      await interaction.reply({
        content: "Nothing is playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const count = interaction.options.getInteger("count") ?? 1;
    const { skipped, next } = skip(interaction.guildId, count);

    if (skipped.length === 0) {
      await interaction.reply("Nothing to skip.");
      return;
    }

    const skippedText =
      skipped.length === 1 ? `**${skipped[0]!.title}**` : `${skipped.length} tracks`;
    const nextText = next
      ? `\n🎶 Up next: **${next.title}** — ${next.artist} (${formatDuration(next.duration)})`
      : "\n📋 Queue is now empty.";

    await interaction.reply(`⏭️ Skipped ${skippedText}${nextText}`);
  },
};
