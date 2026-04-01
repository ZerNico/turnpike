import { AudioPlayerStatus } from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { GuildQueue, Track } from "../types.ts";
import { createTrackResource } from "./player.ts";
import { joinChannel, leaveChannel } from "./voice.ts";

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
      queue.currentTrack = null;
      queues.delete(guildId);
    }
  });

  const queue: GuildQueue = {
    tracks: [],
    currentTrack: null,
    player,
    connection,
    textChannelId,
    idleTimeout: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    queue.currentTrack = null;
    playNext(guildId);
  });

  player.on("error", (error) => {
    console.error(`[Queue ${guildId}] Player error:`, error.message);
    queue.currentTrack = null;
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

  // queue empty
  queue.currentTrack = null;
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
