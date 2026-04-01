import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import type { AudioPlayer, VoiceConnection } from "@discordjs/voice";

export interface Track {
  title: string;
  artist: string;
  duration: number;
  url: string;
  youtubeUrl: string; // always YouTube so yt-dlp can stream it
  thumbnail?: string;
  provider: string;
  requestedBy: string;
}

export interface GuildQueue {
  tracks: Track[];
  currentTrack: Track | null;
  player: AudioPlayer;
  connection: VoiceConnection;
  textChannelId: string;
  idleTimeout: ReturnType<typeof setTimeout> | null;
}

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
