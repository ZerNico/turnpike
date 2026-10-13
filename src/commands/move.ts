import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import {
  autocompleteQueuePosition,
  ensureInBotChannel,
  formatCommandReply,
  formatTrackCount,
  formatTrackSummary,
  replyEphemeral,
} from "../utils.ts";

export const moveCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a track to a different position in the queue")
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("Track to move")
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("New position")
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    await autocompleteQueuePosition(interaction, queueManager);
  },

  async execute(interaction) {
    if (!interaction.guildId) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "This command can only be used in a server."),
      );
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue || queue.getUpcomingCount() < 2) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "There need to be at least 2 upcoming tracks to move."),
      );
      return;
    }

    if (!(await ensureInBotChannel(interaction, queue))) return;

    const from = interaction.options.getInteger("from", true);
    const to = interaction.options.getInteger("to", true);
    const moved = queue.move(from, to);

    if (!moved) {
      await replyEphemeral(
        interaction,
        formatCommandReply(
          "⚠️",
          "Invalid position.",
          `The queue has ${formatTrackCount(queue.getUpcomingCount())}.`,
        ),
      );
      return;
    }

    await interaction.reply(
      formatCommandReply(
        "↕️",
        "Moved track.",
        `${formatTrackSummary(moved)}\n📋 Position: ${from} → ${to}`,
      ),
    );
  },
};
