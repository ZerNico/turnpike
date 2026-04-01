import type { Track } from "../types.ts";

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
  thumbnail?: string;
  provider: string;
}

// resolve() must return a Track with a youtubeUrl so yt-dlp can stream it
export interface SearchProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  resolve(result: SearchResult, requestedBy: string): Promise<Track>;
}
