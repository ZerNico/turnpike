import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatCommandReply, formatTrackCount, replyEphemeral } from "../utils.ts";

export const shuffleCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle the upcoming tracks in the queue"),

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
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "There are no upcoming tracks to shuffle."),
      );
      return;
    }

    const count = queue.shuffle();
    await interaction.reply(
      formatCommandReply("🔀", "Queue shuffled.", `Shuffled ${formatTrackCount(count)}.`),
    );
  },
};
