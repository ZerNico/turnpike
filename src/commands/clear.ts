import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatCommandReply, formatTrackCount, replyEphemeral } from "../utils.ts";

export const clearCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear all upcoming tracks from the queue"),

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
      await replyEphemeral(interaction, formatCommandReply("⚠️", "The queue is already empty."));
      return;
    }

    const count = queue.clear();
    await interaction.reply(
      formatCommandReply("🗑️", "Queue cleared.", `Removed ${formatTrackCount(count)}.`),
    );
  },
};
