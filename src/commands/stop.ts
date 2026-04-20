import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatCommandReply, formatTrackCount, replyEphemeral } from "../utils.ts";

export const stop: Command = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playback, clear the queue, and disconnect"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "This command can only be used in a server."),
      );
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue) {
      await replyEphemeral(interaction, formatCommandReply("⚠️", "Nothing is playing right now."));
      return;
    }

    const info = queue.getInfo();
    const trackCount = info.size + (info.currentTrack ? 1 : 0);
    queue.destroy();

    await interaction.reply(
      formatCommandReply(
        "⏹️",
        "Playback stopped.",
        `Cleared ${formatTrackCount(trackCount)} from the queue.`,
      ),
    );
  },
};
