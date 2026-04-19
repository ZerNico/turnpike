import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";

export const clearCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear all upcoming tracks from the queue"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({
        content: "The queue is already empty.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const count = queue.clear();
    await interaction.reply(
      `🗑️ Cleared **${count}** track${count === 1 ? "" : "s"} from the queue.`,
    );
  },
};
