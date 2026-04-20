import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatCommandReply, replyEphemeral } from "../utils.ts";

export const pauseCmd: Command = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause or resume playback"),

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

    if (queue.isPaused()) {
      queue.resume();
      await interaction.reply(
        formatCommandReply("▶️", "Playback resumed.", `**${queue.currentTrack.title}**`),
      );
    } else {
      queue.pause();
      await interaction.reply(
        formatCommandReply("⏸️", "Playback paused.", `**${queue.currentTrack.title}**`),
      );
    }
  },
};
