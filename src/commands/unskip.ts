import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatDuration } from "../utils.ts";

export const unskipCmd: Command = {
  data: new SlashCommandBuilder().setName("unskip").setDescription("Go back to the previous track"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue) {
      await interaction.reply({
        content: "Nothing is playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (queue.history.length === 0) {
      await interaction.reply({
        content: "No previous track to unskip to.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const track = queue.unskip();

    if (!track) {
      await interaction.reply({
        content: "Failed to play the previous track.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply(
      `⏮️ Now playing: **${track.title}** — ${track.artist} (${formatDuration(track.duration)})`,
    );
  },
};
