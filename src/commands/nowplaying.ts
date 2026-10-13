import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { ButtonInteraction } from "discord.js";
import type { Command, LoopMode } from "../types.ts";
import type { GuildQueue } from "../services/queue.ts";
import { queueManager } from "../services/queue.ts";
import { ensureInBotChannel, formatCommandReply, progressBar, replyEphemeral } from "../utils.ts";
import { nextLoopMode } from "./loop.ts";

export const NOW_PLAYING_BUTTON_PREFIX = "np:";

const LOOP_LABELS: Record<LoopMode, string> = {
  off: "Off",
  track: "🔂 Track",
  queue: "🔁 Queue",
};

function button(action: string, emoji: string, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(`${NOW_PLAYING_BUTTON_PREFIX}${action}`)
    .setEmoji(emoji)
    .setStyle(style);
}

function nothingPlayingMessage() {
  return {
    content: formatCommandReply("⚠️", "Nothing is playing right now."),
    embeds: [],
    components: [],
  };
}

function buildNowPlayingMessage(queue: GuildQueue) {
  const info = queue.getInfo();
  const track = info.currentTrack;
  if (!track) return nothingPlayingMessage();

  const next = info.upcoming[0];
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(info.paused ? "⏸️ Paused" : "🎶 Now Playing")
    .setDescription(
      `[${track.title}](${track.url}) — ${track.artist}\n\`${progressBar(info.playbackSeconds, track.duration)}\``,
    )
    .addFields(
      { name: "Requested by", value: `<@${track.requestedBy}>`, inline: true },
      { name: "Loop", value: LOOP_LABELS[info.loopMode], inline: true },
      { name: "Queue", value: `${info.size} upcoming`, inline: true },
      { name: "Up next", value: next ? `${next.title} — ${next.artist}` : "Nothing queued" },
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("previous", "⏮️").setDisabled(queue.history.length === 0),
    button("toggle", info.paused ? "▶️" : "⏸️", ButtonStyle.Primary),
    button("skip", "⏭️"),
    button(
      "loop",
      info.loopMode === "track" ? "🔂" : "🔁",
      info.loopMode === "off" ? ButtonStyle.Secondary : ButtonStyle.Success,
    ),
    button("stop", "⏹️", ButtonStyle.Danger),
  );

  return { content: "", embeds: [embed], components: [controls] };
}

export async function handleNowPlayingButton(interaction: ButtonInteraction): Promise<void> {
  const action = interaction.customId.slice(NOW_PLAYING_BUTTON_PREFIX.length);
  const queue = interaction.guildId ? queueManager.get(interaction.guildId) : undefined;

  if (!queue?.currentTrack) {
    await interaction.update(nothingPlayingMessage());
    return;
  }

  if (!(await ensureInBotChannel(interaction, queue))) return;

  switch (action) {
    case "previous":
      if (queue.history.length === 0) {
        await replyEphemeral(
          interaction,
          formatCommandReply("⚠️", "There is no previous track to return to."),
        );
        return;
      }
      queue.unskip();
      break;
    case "toggle":
      if (queue.isPaused()) queue.resume();
      else queue.pause();
      break;
    case "skip":
      queue.skip();
      break;
    case "loop":
      queue.setLoopMode(nextLoopMode(queue.loopMode));
      break;
    case "stop":
      queue.destroy();
      await interaction.update({
        content: formatCommandReply("⏹️", "Playback stopped."),
        embeds: [],
        components: [],
      });
      return;
    default:
      return;
  }

  await interaction.update(buildNowPlayingMessage(queue));
}

export const nowPlayingCmd: Command = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the current track with playback controls"),

  async execute(interaction) {
    if (!interaction.guildId) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "This command can only be used in a server."),
      );
      return;
    }

    const queue = queueManager.get(interaction.guildId);

    if (!queue?.currentTrack) {
      await replyEphemeral(interaction, formatCommandReply("⚠️", "Nothing is playing right now."));
      return;
    }

    const { embeds, components } = buildNowPlayingMessage(queue);
    await interaction.reply({ embeds, components });
  },
};
