import { SlashCommandBuilder } from "discord.js";
import type { Command, LoopMode } from "../types.ts";
import { queueManager } from "../services/queue.ts";
import { ensureInBotChannel, formatCommandReply, replyEphemeral } from "../utils.ts";

const NEXT_LOOP_MODE: Record<LoopMode, LoopMode> = {
  off: "track",
  track: "queue",
  queue: "off",
};

export function nextLoopMode(mode: LoopMode): LoopMode {
  return NEXT_LOOP_MODE[mode];
}

export function formatLoopReply(mode: LoopMode): string {
  switch (mode) {
    case "track":
      return formatCommandReply("🔂", "Looping the current track.");
    case "queue":
      return formatCommandReply("🔁", "Looping the queue.", "Finished tracks go back to the end.");
    case "off":
      return formatCommandReply("➡️", "Loop disabled.");
  }
}

export const loopCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Loop the current track or the whole queue")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Loop mode; omit to cycle off → track → queue")
        .addChoices(
          { name: "off", value: "off" },
          { name: "track", value: "track" },
          { name: "queue", value: "queue" },
        ),
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

    if (!queue) {
      await replyEphemeral(interaction, formatCommandReply("⚠️", "Nothing is playing right now."));
      return;
    }

    if (!(await ensureInBotChannel(interaction, queue))) return;

    const requested = interaction.options.getString("mode") as LoopMode | null;
    const mode = requested ?? nextLoopMode(queue.loopMode);
    queue.setLoopMode(mode);

    await interaction.reply(formatLoopReply(mode));
  },
};
