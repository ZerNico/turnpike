import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { getQueue, shuffle } from "../services/queue.ts";

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

    const queue = getQueue(interaction.guildId);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({
        content: "There are no upcoming tracks to shuffle.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const count = shuffle(interaction.guildId);
    await interaction.reply(`🔀 Shuffled **${count}** upcoming tracks.`);
  },
};
