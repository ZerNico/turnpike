#!/bin/sh
set -e

echo "[entrypoint] Updating yt-dlp..."
if yt-dlp -U 2>&1; then
    echo "[entrypoint] yt-dlp update check complete."
else
    echo "[entrypoint] yt-dlp self-update failed, continuing with existing binary."
fi

yt-dlp --version || true

exec "$@"
