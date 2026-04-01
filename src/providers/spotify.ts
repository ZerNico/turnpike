import YouTube from "youtube-sr";
import type { SearchProvider, SearchResult } from "./base.ts";
import type { Track } from "../types.ts";

const SPOTIFY_URL_RE = /^(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist)\/([\w]+)/;

interface SpotifyToken {
  accessToken: string;
  expiresAt: number;
}

export class SpotifyProvider implements SearchProvider {
  readonly name = "spotify";
  private clientId: string;
  private clientSecret: string;
  private token: SpotifyToken | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  static isSpotifyUrl(input: string): boolean {
    return SPOTIFY_URL_RE.test(input.trim());
  }

  static parseSpotifyUrl(input: string): { type: string; id: string } | null {
    const match = input.trim().match(SPOTIFY_URL_RE);
    if (!match) return null;
    return { type: match[1]!, id: match[2]! };
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.accessToken;
    }

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new Error(`Spotify auth failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };

    this.token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
    };

    return this.token.accessToken;
  }

  private async api<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Spotify API error: ${res.status} ${res.statusText} on ${path}`);
    }

    return res.json() as Promise<T>;
  }

  private spotifyTrackToResult(track: SpotifyTrack): SearchResult {
    return {
      id: track.id,
      title: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      duration: Math.floor(track.duration_ms / 1000),
      url: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
      thumbnail: track.album?.images?.[0]?.url,
      provider: this.name,
    };
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    // request extra results so we still have enough after deduplication
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(limit * 3),
    });

    const data = await this.api<SpotifySearchResponse>(`/search?${params}`);
    const items = data.tracks?.items ?? [];

    // dedupe by "artist - title" to avoid the same song from different albums
    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const track of items) {
      const key = `${track.artists.map((a) => a.name).join(", ")} - ${track.name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(this.spotifyTrackToResult(track));
      if (results.length >= limit) break;
    }

    return results;
  }

  async resolve(result: SearchResult, requestedBy: string): Promise<Track> {
    const searchQuery = `${result.artist} - ${result.title}`;
    const video = await YouTube.searchOne(searchQuery);

    if (!video?.id) {
      throw new Error(`No YouTube match found for "${searchQuery}"`);
    }

    return {
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      url: result.url,
      youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnail: result.thumbnail,
      provider: this.name,
      requestedBy,
    };
  }

  async getTrack(url: string): Promise<SearchResult | null> {
    const parsed = SpotifyProvider.parseSpotifyUrl(url);
    if (!parsed || parsed.type !== "track") return null;

    try {
      const track = await this.api<SpotifyTrack>(`/tracks/${parsed.id}`);
      return this.spotifyTrackToResult(track);
    } catch {
      return null;
    }
  }

  private async paginate<T>(startPath: string): Promise<T[]> {
    const allItems: T[] = [];
    let path: string | null = startPath;

    while (path) {
      const page: { items: T[]; next: string | null } = await this.api(path);
      allItems.push(...page.items);
      path = page.next ? page.next.replace("https://api.spotify.com/v1", "") : null;
    }

    return allItems;
  }

  async getAlbum(url: string): Promise<{ name: string; results: SearchResult[] }> {
    const parsed = SpotifyProvider.parseSpotifyUrl(url);
    if (!parsed || parsed.type !== "album") return { name: "Unknown", results: [] };

    const album = await this.api<SpotifyAlbum>(`/albums/${parsed.id}`);
    const items = await this.paginate<SpotifyTrack>(`/albums/${parsed.id}/tracks?limit=50`);

    const results: SearchResult[] = items.map((item) => ({
      id: item.id,
      title: item.name,
      artist: item.artists.map((a) => a.name).join(", "),
      duration: Math.floor(item.duration_ms / 1000),
      url: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
      thumbnail: album.images?.[0]?.url,
      provider: this.name,
    }));

    return { name: album.name, results };
  }

  async getPlaylist(url: string): Promise<{ name: string; results: SearchResult[] }> {
    const parsed = SpotifyProvider.parseSpotifyUrl(url);
    if (!parsed || parsed.type !== "playlist") return { name: "Unknown", results: [] };

    const playlist = await this.api<SpotifyPlaylist>(`/playlists/${parsed.id}`);
    const items = await this.paginate<{ track: SpotifyTrack | null }>(
      `/playlists/${parsed.id}/tracks?limit=50`,
    );

    const results: SearchResult[] = items
      .filter((item) => item.track?.id)
      .map((item) => this.spotifyTrackToResult(item.track!));

    return { name: playlist.name, results };
  }
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyImage {
  url: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  duration_ms: number;
  external_urls?: { spotify: string };
  album?: { images?: SpotifyImage[] };
}

interface SpotifySearchResponse {
  tracks?: { items: SpotifyTrack[] };
}

interface SpotifyAlbum {
  name: string;
  images?: SpotifyImage[];
}

interface SpotifyPlaylist {
  name: string;
}
