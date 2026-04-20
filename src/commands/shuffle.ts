import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";

export const shuffleCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle the upcoming tracks in the queue"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue || !queue.hasUpcomingTracks()) {
      await interaction.reply({
        content: "There are no upcoming tracks to shuffle.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const count = queue.shuffle();
    await interaction.reply(`🔀 Shuffled **${count}** upcoming tracks.`);
  },
};
