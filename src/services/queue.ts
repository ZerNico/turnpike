import { AudioPlayerStatus } from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { GuildQueue, Track } from "../types.ts";
import { createTrackResource } from "./player.ts";
import { joinChannel, leaveChannel } from "./voice.ts";
import { registry } from "../providers/registry.ts";
import { YouTubeProvider } from "../providers/youtube.ts";

const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

const queues = new Map<string, GuildQueue>();

export function getQueue(guildId: string): GuildQueue | undefined {
  return queues.get(guildId);
}

export function getOrCreateQueue(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannelId: string,
): GuildQueue {
  const existing = queues.get(guildId);
  if (existing) return existing;

  const { connection, player } = joinChannel(voiceChannel, () => {
    // clean up queue if the connection gets destroyed externally (e.g. kicked, disconnect failed)
    const queue = queues.get(guildId);
    if (queue) {
      if (queue.idleTimeout) clearTimeout(queue.idleTimeout);
      queue.tracks = [];
      queue.history = [];
      queue.currentTrack = null;
      queues.delete(guildId);
    }
  });

  const queue: GuildQueue = {
    tracks: [],
    history: [],
    currentTrack: null,
    autoplay: false,
    player,
    connection,
    textChannelId,
    idleTimeout: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId);
  });

  player.on("error", (error) => {
    console.error(`[Queue ${guildId}] Player error:`, error.message);
    playNext(guildId);
  });

  queues.set(guildId, queue);
  return queue;
}

export function enqueue(guildId: string, track: Track): number {
  const queue = queues.get(guildId);
  if (!queue) throw new Error("No queue for this guild");

  queue.tracks.push(track);

  if (!queue.currentTrack && queue.player.state.status === AudioPlayerStatus.Idle) {
    playNext(guildId);
  }

  return queue.tracks.length;
}

export function playNext(guildId: string): Track | null {
  const queue = queues.get(guildId);
  if (!queue) return null;

  if (queue.idleTimeout) {
    clearTimeout(queue.idleTimeout);
    queue.idleTimeout = null;
  }

  if (queue.currentTrack) {
    queue.history.push(queue.currentTrack);
  }

  // loop instead of recursion to avoid stack overflow on repeated failures
  while (queue.tracks.length > 0) {
    const next = queue.tracks.shift()!;
    queue.currentTrack = next;

    try {
      const resource = createTrackResource(next);
      queue.player.play(resource);
      return next;
    } catch (error) {
      console.error(`[Queue ${guildId}] Failed to create resource for "${next.title}":`, error);
      queue.currentTrack = null;
    }
  }

  queue.currentTrack = null;

  if (queue.autoplay && queue.history.length > 0) {
    handleAutoplay(guildId, queue);
    return null;
  }

  queue.idleTimeout = setTimeout(() => {
    destroyQueue(guildId);
  }, IDLE_TIMEOUT_MS);
  return null;
}

export function skip(guildId: string, count = 1): { skipped: Track[]; next: Track | null } {
  const queue = queues.get(guildId);
  if (!queue || !queue.currentTrack) return { skipped: [], next: null };

  const skipped: Track[] = [queue.currentTrack];

  const toDrop = Math.min(count - 1, queue.tracks.length);
  if (toDrop > 0) {
    skipped.push(...queue.tracks.splice(0, toDrop));
  }

  queue.player.stop(); // triggers Idle → playNext

  const next = queue.tracks[0] ?? null;
  return { skipped, next };
}

export function destroyQueue(guildId: string): void {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.idleTimeout) {
    clearTimeout(queue.idleTimeout);
  }

  queue.tracks = [];
  queue.history = [];
  queue.currentTrack = null;
  leaveChannel(queue.connection, queue.player);
  queues.delete(guildId);
}

export function pause(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  return queue.player.pause();
}

export function resume(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  return queue.player.unpause();
}

export function shuffle(guildId: string): number {
  const queue = queues.get(guildId);
  if (!queue) return 0;

  const arr = queue.tracks;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }

  return arr.length;
}

export function removeTrack(guildId: string, position: number): Track | null {
  const queue = queues.get(guildId);
  if (!queue) return null;

  const index = position - 1;
  if (index < 0 || index >= queue.tracks.length) return null;

  const [removed] = queue.tracks.splice(index, 1);
  return removed ?? null;
}

export function unskip(guildId: string): Track | null {
  const queue = queues.get(guildId);
  if (!queue || queue.history.length === 0) return null;

  if (queue.currentTrack) {
    queue.tracks.unshift(queue.currentTrack);
  }

  const prev = queue.history.pop()!;
  queue.currentTrack = prev;

  if (queue.idleTimeout) {
    clearTimeout(queue.idleTimeout);
    queue.idleTimeout = null;
  }

  try {
    const resource = createTrackResource(prev);
    queue.player.play(resource);
    return prev;
  } catch (error) {
    console.error(`[Queue ${guildId}] Failed to create resource for "${prev.title}":`, error);
    queue.currentTrack = null;
    playNext(guildId);
    return null;
  }
}

export function clearQueue(guildId: string): number {
  const queue = queues.get(guildId);
  if (!queue) return 0;

  const count = queue.tracks.length;
  queue.tracks = [];
  return count;
}

async function getAutoplayTrack(seed: Track, history: Track[]): Promise<Track | null> {
  try {
    const youtube = registry.get("youtube") as YouTubeProvider;
    const videoId = YouTubeProvider.extractVideoId(seed.youtubeUrl);
    if (!videoId) return null;

    const played = new Set(
      history.map((t) => YouTubeProvider.extractVideoId(t.youtubeUrl)).filter(Boolean),
    );

    const results = await youtube.getRelated(videoId);
    const pick = results.find((r) => !played.has(r.id));
    if (pick) {
      return await youtube.resolve(pick, seed.requestedBy);
    }
  } catch (error) {
    console.error("[Autoplay] YouTube related videos failed:", error);
  }

  return null;
}

function handleAutoplay(guildId: string, queue: GuildQueue): void {
  const seed = queue.history[queue.history.length - 1]!;

  getAutoplayTrack(seed, queue.history)
    .then((track) => {
      const current = queues.get(guildId);
      if (!current || current.currentTrack || current.tracks.length > 0) return;

      if (!track) {
        console.warn(`[Autoplay ${guildId}] No recommendation found, starting idle timer`);
        current.idleTimeout = setTimeout(() => destroyQueue(guildId), IDLE_TIMEOUT_MS);
        return;
      }

      current.tracks.push(track);
      playNext(guildId);
    })
    .catch((error) => {
      console.error(`[Autoplay ${guildId}] Error:`, error);
      const current = queues.get(guildId);
      if (current && !current.currentTrack) {
        current.idleTimeout = setTimeout(() => destroyQueue(guildId), IDLE_TIMEOUT_MS);
      }
    });
}

export function getQueueInfo(guildId: string): {
  currentTrack: Track | null;
  playbackSeconds: number;
  upcoming: Track[];
  size: number;
} | null {
  const queue = queues.get(guildId);
  if (!queue) return null;

  let playbackSeconds = 0;
  const state = queue.player.state;
  if (state.status === AudioPlayerStatus.Playing || state.status === AudioPlayerStatus.Paused) {
    playbackSeconds = Math.floor(state.playbackDuration / 1000);
  }

  return {
    currentTrack: queue.currentTrack,
    playbackSeconds,
    upcoming: [...queue.tracks],
    size: queue.tracks.length,
  };
}
