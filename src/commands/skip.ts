import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import {
  formatCommandReply,
  formatTrackCount,
  formatTrackSummary,
  replyEphemeral,
} from "../utils.ts";

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
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "This command can only be used in a server."),
      );
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      await replyEphemeral(interaction, formatCommandReply("⚠️", "Nothing is playing right now."));
      return;
    }

    const count = interaction.options.getInteger("count") ?? 1;
    const { skipped, next } = queue.skip(count);

    if (skipped.length === 0) {
      await interaction.reply(formatCommandReply("⚠️", "Nothing was skipped."));
      return;
    }

    const skippedText =
      skipped.length === 1
        ? `Skipped ${formatTrackSummary(skipped[0]!)}`
        : `Skipped ${formatTrackCount(skipped.length)}.`;
    const nextText = next
      ? `🎶 Up next: ${formatTrackSummary(next)}`
      : "📋 The queue is now empty.";

    await interaction.reply(
      formatCommandReply("⏭️", "Skip complete.", `${skippedText}\n${nextText}`),
    );
  },
};
