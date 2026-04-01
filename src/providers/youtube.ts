import YouTube from "youtube-sr";
import type { SearchProvider, SearchResult } from "./base.ts";
import type { Track } from "../types.ts";

const YOUTUBE_URL_RE =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;

const YOUTUBE_PLAYLIST_RE =
  /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:playlist\?list=|watch\?.*?[&?]list=)([\w-]+)/;

export class YouTubeProvider implements SearchProvider {
  readonly name = "youtube";

  static isYouTubeUrl(input: string): boolean {
    return YOUTUBE_URL_RE.test(input.trim());
  }

  static extractVideoId(url: string): string | null {
    const match = url.trim().match(YOUTUBE_URL_RE);
    return match?.[1] ?? null;
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const results = await YouTube.search(query, { limit, type: "video" });

    return results.map((video) => ({
      id: video.id ?? "",
      title: video.title ?? "Unknown",
      artist: video.channel?.name ?? "Unknown",
      duration: Math.floor((video.duration ?? 0) / 1000), // ms → s
      url: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnail: video.thumbnail?.url,
      provider: this.name,
    }));
  }

  static isPlaylistUrl(input: string): boolean {
    return YOUTUBE_PLAYLIST_RE.test(input.trim());
  }

  async getPlaylist(url: string): Promise<{ name: string; results: SearchResult[] }> {
    const playlist = await YouTube.getPlaylist(url.trim(), { fetchAll: true });

    const results: SearchResult[] = (playlist.videos ?? [])
      .filter((video) => video.id)
      .map((video) => ({
        id: video.id ?? "",
        title: video.title ?? "Unknown",
        artist: video.channel?.name ?? "Unknown",
        duration: Math.floor((video.duration ?? 0) / 1000),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        thumbnail: video.thumbnail?.url,
        provider: this.name,
      }));

    return {
      name: playlist.title ?? "Unknown Playlist",
      results,
    };
  }

  async getVideo(urlOrId: string): Promise<SearchResult | null> {
    try {
      const videoId = YouTubeProvider.extractVideoId(urlOrId) ?? urlOrId;
      const video = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`);
      if (!video) return null;

      return {
        id: video.id ?? videoId,
        title: video.title ?? "Unknown",
        artist: video.channel?.name ?? "Unknown",
        duration: Math.floor((video.duration ?? 0) / 1000),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        thumbnail: video.thumbnail?.url,
        provider: this.name,
      };
    } catch {
      return null;
    }
  }

  async resolve(result: SearchResult, requestedBy: string): Promise<Track> {
    return {
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      url: result.url,
      youtubeUrl: result.url,
      thumbnail: result.thumbnail,
      provider: this.name,
      requestedBy,
    };
  }
}
