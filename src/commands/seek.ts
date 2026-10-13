import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import {
  ensureInBotChannel,
  formatCommandReply,
  formatDuration,
  parseTimestamp,
  replyEphemeral,
} from "../utils.ts";

export const seekCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Jump to a position in the current track")
    .addStringOption((option) =>
      option
        .setName("position")
        .setDescription("Position like 1:30, 1:02:03 or 90 (seconds)")
        .setRequired(true),
    ),

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

    if (!(await ensureInBotChannel(interaction, queue))) return;

    const input = interaction.options.getString("position", true);
    const seconds = parseTimestamp(input);
    const track = queue.currentTrack;

    if (seconds === null) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "Invalid position.", "Use a format like `1:30` or `90`."),
      );
      return;
    }

    if (track.duration > 0 && seconds >= track.duration) {
      await replyEphemeral(
        interaction,
        formatCommandReply(
          "⚠️",
          "That's past the end of the track.",
          `**${track.title}** is ${formatDuration(track.duration)} long.`,
        ),
      );
      return;
    }

    if (!queue.seek(seconds)) {
      await replyEphemeral(interaction, formatCommandReply("⚠️", "Couldn't seek in that track."));
      return;
    }

    await interaction.reply(
      formatCommandReply("⏩", `Jumped to ${formatDuration(seconds)}.`, `**${track.title}**`),
    );
  },
};
