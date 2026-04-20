import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatCommandReply, formatTrackSummary, replyEphemeral } from "../utils.ts";

export const unskipCmd: Command = {
  data: new SlashCommandBuilder().setName("unskip").setDescription("Go back to the previous track"),

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

    if (queue.history.length === 0) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "There is no previous track to return to."),
      );
      return;
    }

    const track = queue.unskip();

    if (!track) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "Couldn't replay the previous track."),
      );
      return;
    }

    await interaction.reply(
      formatCommandReply("⏮️", "Returned to the previous track.", formatTrackSummary(track)),
    );
  },
};
