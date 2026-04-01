import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import type { Command } from "../types.ts";
import { getQueue, pause, resume } from "../services/queue.ts";

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

    const queue = getQueue(interaction.guildId);

    if (!queue || !queue.currentTrack) {
      await interaction.reply({
        content: "Nothing is playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (queue.player.state.status === AudioPlayerStatus.Paused) {
      resume(interaction.guildId);
      await interaction.reply(`▶️ Resumed **${queue.currentTrack.title}**`);
    } else {
      pause(interaction.guildId);
      await interaction.reply(`⏸️ Paused **${queue.currentTrack.title}**`);
    }
  },
};
