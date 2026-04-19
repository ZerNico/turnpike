import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { formatDuration } from "../utils.ts";

export const removeCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a track from the queue by its position")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("Position of the track to remove (use /queue to see positions)")
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({
        content: "The queue is empty.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const position = interaction.options.getInteger("position", true);
    const removed = queue.remove(position);

    if (!removed) {
      await interaction.reply({
        content: `Invalid position. The queue has ${queue.tracks.length} track${queue.tracks.length === 1 ? "" : "s"}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply(
      `🗑️ Removed **${removed.title}** — ${removed.artist} (${formatDuration(removed.duration)}) from position ${position}.`,
    );
  },
};
