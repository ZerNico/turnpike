import { GuildMember, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { registry } from "../providers/registry.ts";
import { YouTubeProvider } from "../providers/youtube.ts";
import { SpotifyProvider } from "../providers/spotify.ts";
import { queueManager } from "../services/queue.ts";
import {
  formatDuration,
  replyWithTrackStatus,
  enqueueMultiple,
  formatBulkAddReply,
} from "../utils.ts";

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song or playlist (YouTube/Spotify)")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Search or paste a link")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const query = interaction.options.getString("query", true);

    if (query.length < 2) {
      await interaction.respond([]);
      return;
    }

    try {
      const provider = registry.getDefault();
      const results = await provider.search(query, 10);

      await interaction.respond(
        results.map((result) => {
          const label =
            result.type === "album"
              ? `💿 ${result.title} — ${result.artist} (${result.totalTracks} tracks)`
              : `🎵 ${result.title} — ${result.artist} (${formatDuration(result.duration)})`;
          return { name: label.slice(0, 100), value: result.url };
        }),
      );
    } catch (error) {
      console.error("[Play autocomplete] Error:", error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const member = interaction.member;

    if (!(member instanceof GuildMember) || !member.voice.channel) {
      await interaction.reply({
        content: "You need to be in a voice channel to play music!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const query = interaction.options.getString("query", true);
    await interaction.deferReply();

    try {
      const queue = queueManager.getOrCreate(
        interaction.guildId,
        member.voice.channel,
        interaction.channelId,
      );

      if (YouTubeProvider.isPlaylistUrl(query)) {
        const ytProvider = registry.get("youtube") as YouTubeProvider;
        const { name, results } = await ytProvider.getPlaylist(query);

        if (results.length === 0) {
          await interaction.editReply("That playlist appears to be empty or couldn't be loaded.");
          return;
        }

        const { added, failed } = await enqueueMultiple(
          queue,
          results,
          ytProvider,
          interaction.user.id,
        );
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
        await interaction.editReply(
          formatBulkAddReply("📋", added, "YouTube playlist", name, totalDuration, failed),
        );
        return;
      }

      if (YouTubeProvider.isYouTubeUrl(query)) {
        const ytProvider = registry.get("youtube") as YouTubeProvider;
        const result = await ytProvider.getVideo(query);
        if (!result) {
          await interaction.editReply("Couldn't load that YouTube URL. Is it a valid video?");
          return;
        }
        const track = await ytProvider.resolve(result, interaction.user.id);
        queue.enqueue(track);
        await replyWithTrackStatus(interaction, track, queue);
        return;
      }

      if (SpotifyProvider.isSpotifyUrl(query)) {
        const spotifyProvider = registry.get("spotify") as SpotifyProvider;
        const parsed = SpotifyProvider.parseSpotifyUrl(query);
        if (!parsed) {
          await interaction.editReply("Couldn't parse that Spotify URL.");
          return;
        }

        if (parsed.type === "track") {
          const result = await spotifyProvider.getTrack(query);
          if (!result) {
            await interaction.editReply("Couldn't load that Spotify track.");
            return;
          }
          const track = await spotifyProvider.resolve(result, interaction.user.id);
          queue.enqueue(track);
          await replyWithTrackStatus(interaction, track, queue);
          return;
        }

        if (parsed.type === "album" || parsed.type === "playlist") {
          const { name, results } =
            parsed.type === "album"
              ? await spotifyProvider.getAlbum(query)
              : await spotifyProvider.getPlaylist(query);

          if (results.length === 0) {
            await interaction.editReply(
              `That ${parsed.type} appears to be empty or couldn't be loaded.`,
            );
            return;
          }

          const { added, failed } = await enqueueMultiple(
            queue,
            results,
            spotifyProvider,
            interaction.user.id,
          );
          const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
          const emoji = parsed.type === "album" ? "💿" : "📋";
          await interaction.editReply(
            formatBulkAddReply(emoji, added, `Spotify ${parsed.type}`, name, totalDuration, failed),
          );
          return;
        }
      }

      const provider = registry.getDefault();
      const results = await provider.search(query, 1);
      if (results.length === 0) {
        await interaction.editReply("No results found for your query.");
        return;
      }

      const track = await provider.resolve(results[0]!, interaction.user.id);
      queue.enqueue(track);
      await replyWithTrackStatus(interaction, track, queue);
    } catch (error) {
      console.error("[Play] Error:", error);
      await interaction.editReply("Something went wrong while trying to play that track.");
    }
  },
};
