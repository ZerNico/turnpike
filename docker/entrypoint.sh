#!/bin/sh
set -e

# YTDLP_VERSION pins yt-dlp to a specific release or channel (e.g. "2025.01.15",
# "nightly", "stable@2025.01.15"); otherwise it updates to the latest stable.
if [ -n "$YTDLP_VERSION" ]; then
    echo "[entrypoint] Switching yt-dlp to $YTDLP_VERSION..."
    update_args="--update-to $YTDLP_VERSION"
else
    echo "[entrypoint] Updating yt-dlp..."
    update_args="-U"
fi

# shellcheck disable=SC2086
if yt-dlp $update_args 2>&1; then
    echo "[entrypoint] yt-dlp update check complete."
else
    echo "[entrypoint] yt-dlp update failed, continuing with existing binary."
fi

echo "[entrypoint] Using yt-dlp $(yt-dlp --version 2>/dev/null || echo unknown)"

exec "$@"
