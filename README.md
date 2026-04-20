# Turnpike

A Discord music bot built with TypeScript, discord.js v14, and yt-dlp. Supports YouTube and Spotify with slash commands, autocomplete search, a per-guild queue, autoplay based on YouTube Music radio, and session persistence that survives restarts.

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

# Optional: enables Spotify search + link support
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Optional: path to cookies.txt for yt-dlp (age-restricted videos, etc.)
YTDLP_COOKIES_FILE=

# Optional: path to the SQLite database file (default: ./data/turnpike.db)
DATABASE_PATH=
```

Get Spotify credentials from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). If configured, Spotify becomes the default search provider. Without it, everything works with YouTube only.

For cookies, export your YouTube cookies using the "Get cookies.txt LOCALLY" browser extension and point `YTDLP_COOKIES_FILE` to the file. This enables playback of age-restricted videos.

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

| Command                  | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `/play <query>`          | Search or paste a link (YouTube/Spotify)                       |
| `/skip [count]`          | Skip the current track (or multiple)                           |
| `/unskip`                | Replay the previously played track                             |
| `/stop`                  | Stop playback, clear queue, and disconnect                     |
| `/queue [page]`          | Show the queue with progress bar and pagination                |
| `/pause`                 | Toggle pause/resume                                            |
| `/shuffle`               | Shuffle upcoming tracks in the queue                           |
| `/remove <pos>`          | Remove a track from the queue by position                      |
| `/clear`                 | Clear all upcoming tracks but keep the current one playing     |
| `/autoplay [on/off]`     | Toggle autoplay (queue related tracks when the queue runs out) |
| `/sponsorblock [on/off]` | Toggle SponsorBlock skipping for newly started YouTube tracks  |

### Session persistence

Queues, playback position, pause state, and per-guild settings such as autoplay and SponsorBlock are stored in a local SQLite database (`./data/turnpike.db` by default). When the bot restarts, it rejoins the previous voice channel and resumes the current track roughly where it left off.

### Supported links

- YouTube video URLs (`youtube.com/watch?v=...`, `youtu.be/...`)
- YouTube playlist URLs (`youtube.com/playlist?list=...`)
- Spotify track URLs (`open.spotify.com/track/...`)
- Spotify album URLs (`open.spotify.com/album/...`)
- Spotify playlist URLs (`open.spotify.com/playlist/...`)

## Docker

```bash
docker build -t turnpike .
docker run --env-file .env -v turnpike-data:/app/data turnpike
```

The `-v turnpike-data:/app/data` mount persists the SQLite database across container restarts.

With cookies:

```bash
docker run --env-file .env -v turnpike-data:/app/data -v ./cookies.txt:/app/cookies.txt -e YTDLP_COOKIES_FILE=/app/cookies.txt turnpike
```

Or pull from GHCR:

```bash
docker pull ghcr.io/zernico/turnpike:latest
docker run --env-file .env -v turnpike-data:/app/data ghcr.io/zernico/turnpike:latest
```
