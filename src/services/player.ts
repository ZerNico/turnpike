import { createAudioResource, StreamType } from "@discordjs/voice";
import { spawn } from "node:child_process";
import type { Track } from "../types.ts";

// yt-dlp → ffmpeg (loudnorm) → AudioResource
export function createTrackResource(track: Track) {
  const ytdlp = spawn(
    "yt-dlp",
    [
      "--no-warnings",
      "--no-playlist",
      "-f",
      "bestaudio[ext=webm]/bestaudio",
      "-o",
      "-",
      track.youtubeUrl,
    ],
    {
      stdio: ["ignore", "pipe", "ignore"],
    },
  );

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-i",
      "pipe:0",
      "-af",
      "loudnorm=I=-14:TP=-1:LRA=11",
      "-f",
      "ogg",
      "-c:a",
      "libopus",
      "-ar",
      "48000",
      "-ac",
      "2",
      "pipe:1",
    ],
    {
      stdio: ["pipe", "pipe", "ignore"],
    },
  );

  ytdlp.stdout!.pipe(ffmpeg.stdin!);

  const resource = createAudioResource(ffmpeg.stdout!, {
    inputType: StreamType.OggOpus,
    metadata: track,
  });

  const cleanup = () => {
    ytdlp.kill();
    ffmpeg.kill();
  };

  ffmpeg.stdout!.on("end", cleanup);
  ffmpeg.stdout!.on("error", cleanup);
  ytdlp.stdout!.on("error", cleanup);
  ytdlp.on("error", cleanup);
  ffmpeg.on("error", cleanup);

  return resource;
}
