import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";

export const pauseCmd: Command = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause or resume playback"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      await interaction.reply({
        content: "Nothing is playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (queue.isPaused()) {
      queue.resume();
      await interaction.reply(`▶️ Resumed **${queue.currentTrack.title}**`);
    } else {
      queue.pause();
      await interaction.reply(`⏸️ Paused **${queue.currentTrack.title}**`);
    }
  },
};
