import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatCommandReply, replyEphemeral } from "../utils.ts";

export const autoplayCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle autoplay — automatically play related tracks when the queue ends")
    .addStringOption((option) =>
      option
        .setName("state")
        .setDescription("Set autoplay explicitly; omit to toggle")
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "This command can only be used in a server."),
      );
      return;
    }

    const requestedState = interaction.options.getString("state");
    const newValue =
      requestedState === null
        ? queueManager.toggleAutoplay(interaction.guildId)
        : requestedState === "on";

    if (requestedState !== null) {
      queueManager.setAutoplay(interaction.guildId, newValue);
    }

    if (newValue) {
      await interaction.reply(
        formatCommandReply(
          "🔄",
          "Autoplay enabled.",
          "Related tracks will play when the queue ends.",
        ),
      );
    } else {
      await interaction.reply(
        formatCommandReply("⏹️", "Autoplay disabled.", "Playback will stop when the queue ends."),
      );
    }
  },
};
