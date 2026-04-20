import { GuildMember, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { registry } from "../providers/registry.ts";
import { YouTubeProvider } from "../providers/youtube.ts";
import { SpotifyProvider } from "../providers/spotify.ts";
import { queueManager } from "../services/queue.ts";
import {
  formatDuration,
  formatCommandReply,
  replyWithTrackStatus,
  enqueueMultiple,
  formatBulkAddReply,
  replyEphemeral,
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
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "Join a voice channel first.", "Then use `/play` again."),
      );
      return;
    }

    if (!interaction.guildId) {
      await replyEphemeral(
        interaction,
        formatCommandReply("⚠️", "This command can only be used in a server."),
      );
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
          await interaction.editReply(
            formatCommandReply("⚠️", "Couldn't load that YouTube playlist.", "It may be empty."),
          );
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
          await interaction.editReply(
            formatCommandReply(
              "⚠️",
              "Couldn't load that YouTube video.",
              "Make sure the URL is valid.",
            ),
          );
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
          await interaction.editReply(formatCommandReply("⚠️", "Couldn't parse that Spotify URL."));
          return;
        }

        if (parsed.type === "track") {
          const result = await spotifyProvider.getTrack(query);
          if (!result) {
            await interaction.editReply(
              formatCommandReply("⚠️", "Couldn't load that Spotify track."),
            );
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
              formatCommandReply(
                "⚠️",
                `Couldn't load that Spotify ${parsed.type}.`,
                "It may be empty.",
              ),
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
        await interaction.editReply(
          formatCommandReply("⚠️", "No results found.", "Try a different search."),
        );
        return;
      }

      const track = await provider.resolve(results[0]!, interaction.user.id);
      queue.enqueue(track);
      await replyWithTrackStatus(interaction, track, queue);
    } catch (error) {
      console.error("[Play] Error:", error);
      await interaction.editReply(
        formatCommandReply("⚠️", "Couldn't play that track.", "Please try again."),
      );
    }
  },
};
