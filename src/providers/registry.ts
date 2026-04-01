import type { SearchProvider } from "./base.ts";
import { YouTubeProvider } from "./youtube.ts";
import { SpotifyProvider } from "./spotify.ts";
import { config } from "../config.ts";

class ProviderRegistry {
  private providers = new Map<string, SearchProvider>();
  private defaultProvider: string;

  constructor() {
    const youtube = new YouTubeProvider();
    this.register(youtube);
    this.defaultProvider = youtube.name;

    if (config.spotifyClientId && config.spotifyClientSecret) {
      const spotify = new SpotifyProvider(config.spotifyClientId, config.spotifyClientSecret);
      this.register(spotify);
      this.defaultProvider = spotify.name;
      console.log("🎵 Spotify provider enabled (default for search)");
    }
  }

  register(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name?: string): SearchProvider {
    const key = name ?? this.defaultProvider;
    const provider = this.providers.get(key);

    if (!provider) {
      throw new Error(
        `Unknown provider "${key}". Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    return provider;
  }

  getDefault(): SearchProvider {
    return this.get(this.defaultProvider);
  }

  listNames(): string[] {
    return [...this.providers.keys()];
  }
}

export const registry = new ProviderRegistry();
