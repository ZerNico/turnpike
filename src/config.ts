const token = Bun.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in .env");
}

export const config = {
  token,
  spotifyClientId: Bun.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: Bun.env.SPOTIFY_CLIENT_SECRET,
} as const;
