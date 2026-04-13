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

  async getRelated(videoId: string): Promise<SearchResult[]> {
    try {
      const res = await fetch("https://music.youtube.com/youtubei/v1/next", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0)",
          "X-YouTube-Client-Name": "67",
          "X-YouTube-Client-Version": "1.20240101.00.00",
          Origin: "https://music.youtube.com",
          Referer: "https://music.youtube.com/",
        },
        body: JSON.stringify({
          videoId,
          playlistId: `RDAMVM${videoId}`,
          isAudioOnly: true,
          context: {
            client: {
              clientName: "WEB_REMIX",
              clientVersion: "1.20240101.00.00",
            },
          },
        }),
      });

      if (!res.ok) {
        console.error(`[YouTube] Music radio request failed: ${res.status}`);
        return [];
      }

      const data = (await res.json()) as YTMusicNextResponse;
      const tabs =
        data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
          ?.watchNextTabbedResultsRenderer?.tabs ?? [];

      const results: SearchResult[] = [];
      for (const tab of tabs) {
        const items =
          tab?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ??
          [];

        for (const item of items) {
          const renderer = item.playlistPanelVideoRenderer;
          if (!renderer?.videoId || renderer.videoId === videoId) continue;

          results.push({
            id: renderer.videoId,
            title: renderer.title?.runs?.[0]?.text ?? "Unknown",
            artist: renderer.shortBylineText?.runs?.[0]?.text ?? "Unknown",
            duration: this.parseDuration(renderer.lengthText?.runs?.[0]?.text),
            url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
            thumbnail: renderer.thumbnail?.thumbnails?.[0]?.url,
            provider: this.name,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[YouTube] Failed to get related videos:", error);
      return [];
    }
  }

  private parseDuration(text?: string): number {
    if (!text) return 0;
    const parts = text.split(":").map(Number);
    if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
    return 0;
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

interface YTMusicNextResponse {
  contents?: {
    singleColumnMusicWatchNextResultsRenderer?: {
      tabbedRenderer?: {
        watchNextTabbedResultsRenderer?: {
          tabs?: YTMusicTab[];
        };
      };
    };
  };
}

interface YTMusicTab {
  tabRenderer?: {
    content?: {
      musicQueueRenderer?: {
        content?: {
          playlistPanelRenderer?: {
            contents?: YTMusicPlaylistItem[];
          };
        };
      };
    };
  };
}

interface YTMusicPlaylistItem {
  playlistPanelVideoRenderer?: {
    videoId: string;
    title?: { runs?: { text: string }[] };
    shortBylineText?: { runs?: { text: string }[] };
    lengthText?: { runs?: { text: string }[] };
    thumbnail?: { thumbnails?: { url: string }[] };
  };
}
