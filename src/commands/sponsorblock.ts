import { SlashCommandBuilder } from "discord.js";
import { queueManager } from "../services/queue.ts";
import type { Command } from "../types.ts";
import { formatCommandReply, replyEphemeral } from "../utils.ts";

export const sponsorblockCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("sponsorblock")
    .setDescription("Toggle SponsorBlock skipping for this server")
    .addStringOption((option) =>
      option
        .setName("state")
        .setDescription("Set SponsorBlock explicitly; omit to toggle")
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
        ? queueManager.toggleSponsorblockEnabled(interaction.guildId)
        : requestedState === "on";

    if (requestedState !== null) {
      queueManager.setSponsorblockEnabled(interaction.guildId, newValue);
    }

    if (newValue) {
      await interaction.reply(
        formatCommandReply(
          "✅",
          "SponsorBlock enabled.",
          "Newly started YouTube tracks will skip the default SponsorBlock segments.",
        ),
      );
    } else {
      await interaction.reply(
        formatCommandReply(
          "⏹️",
          "SponsorBlock disabled.",
          "Newly started YouTube tracks will play without SponsorBlock skipping.",
        ),
      );
    }
  },
};
