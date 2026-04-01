# Turnpike

A Discord music bot built with TypeScript, discord.js v14, and yt-dlp. Supports YouTube and Spotify with slash commands, autocomplete search, and a per-guild queue.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [FFmpeg](https://ffmpeg.org)
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

## Setup

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```
DISCORD_TOKEN=your_bot_token_here
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Get Spotify credentials from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). If configured, Spotify becomes the default search provider. Without it, everything works with YouTube only.

3. Start the bot:

```bash
bun run start
```

For development with auto-restart on file changes:

```bash
bun dev
```

Slash commands are automatically registered with Discord on startup.

## Commands

| Command            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `/play <query>`    | Search or paste a link (YouTube/Spotify)             |
| `/skip [count]`    | Skip the current track (or multiple)                 |
| `/stop`            | Stop playback, clear queue, and disconnect           |
| `/queue [page]`    | Show the queue with progress bar and pagination      |
| `/pause`           | Toggle pause/resume                                  |
| `/shuffle`         | Shuffle upcoming tracks in the queue                 |
| `/remove <pos>`    | Remove a track from the queue by position            |

### Supported links

- YouTube video URLs (`youtube.com/watch?v=...`, `youtu.be/...`)
- YouTube playlist URLs (`youtube.com/playlist?list=...`)
- Spotify track URLs (`open.spotify.com/track/...`)
- Spotify album URLs (`open.spotify.com/album/...`)
- Spotify playlist URLs (`open.spotify.com/playlist/...`)

## Docker

```bash
docker build -t turnpike .
docker run --env-file .env turnpike
```

Or pull from GHCR:

```bash
docker pull ghcr.io/zernico/turnpike:latest
docker run --env-file .env ghcr.io/zernico/turnpike:latest
```
