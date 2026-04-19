import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";

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

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
