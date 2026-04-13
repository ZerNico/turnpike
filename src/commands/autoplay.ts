import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { getQueue } from "../services/queue.ts";

export const autoplayCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle autoplay — automatically play related tracks when the queue ends"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = getQueue(interaction.guildId);

    if (!queue) {
      await interaction.reply({
        content: "Nothing is playing right now. Start playing something first!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    queue.autoplay = !queue.autoplay;

    if (queue.autoplay) {
      await interaction.reply(
        "🔄 Autoplay **enabled** — related tracks will play when the queue ends.",
      );
    } else {
      await interaction.reply("⏹️ Autoplay **disabled** — playback will stop when the queue ends.");
    }
  },
};
