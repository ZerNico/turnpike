import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import {
  formatCommandReply,
  formatTrackCount,
  formatTrackSummary,
  replyEphemeral,
} from "../utils.ts";

export const removeCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a track from the queue by its position")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("Position of the track to remove (use /queue to see positions)")
        .setRequired(true)
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

    if (!queue || !queue.hasUpcomingTracks()) {
      await replyEphemeral(interaction, formatCommandReply("⚠️", "The queue is empty."));
      return;
    }

    const position = interaction.options.getInteger("position", true);
    const removed = queue.remove(position);

    if (!removed) {
      const upcomingCount = queue.getUpcomingCount();
      await replyEphemeral(
        interaction,
        formatCommandReply(
          "⚠️",
          "Invalid position.",
          `The queue has ${formatTrackCount(upcomingCount)}.`,
        ),
      );
      return;
    }

    await interaction.reply(
      formatCommandReply(
        "🗑️",
        "Removed track from the queue.",
        `${formatTrackSummary(removed)}\n📋 Position: ${position}`,
      ),
    );
  },
};
