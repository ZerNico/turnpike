import { AudioPlayerStatus } from "@discordjs/voice";
import type { AudioPlayer, VoiceConnection } from "@discordjs/voice";
import type { Client, VoiceBasedChannel } from "discord.js";
import { DiscordAPIError } from "discord.js";
import { eq } from "drizzle-orm";
import type { Track } from "../types.ts";
import { db } from "../db/index.ts";
import { guildQueues, guildSettings } from "../db/schema.ts";
import { registry } from "../providers/registry.ts";
import { YouTubeProvider } from "../providers/youtube.ts";
import { createTrackResource } from "./player.ts";
import { joinChannel, leaveChannel } from "./voice.ts";

const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const POSITION_CHECKPOINT_MS = 10 * 1000;
const RESUME_END_BUFFER_SECONDS = 5;

// Discord API codes: 10003 = Unknown Channel, 10004 = Unknown Guild
function isMissingResourceError(error: unknown): boolean {
  return error instanceof DiscordAPIError && (error.code === 10003 || error.code === 10004);
}

interface ResumeState {
  track: Track;
  positionSeconds: number;
  paused: boolean;
}

function buildResumeState(
  currentTrack: Track | null,
  currentPositionSeconds: number,
  paused: boolean,
): ResumeState | null {
  if (!currentTrack || currentTrack.duration <= 0) return null;

  const positionSeconds = Math.min(Math.max(currentPositionSeconds, 0), currentTrack.duration);
  const endThreshold = Math.max(currentTrack.duration - RESUME_END_BUFFER_SECONDS, 0);
  if (positionSeconds >= endThreshold) return null;

  return { track: currentTrack, positionSeconds, paused };
}

export interface QueueInfo {
  currentTrack: Track | null;
  playbackSeconds: number;
  upcoming: Track[];
  size: number;
}

interface GuildQueueOptions {
  guildId: string;
  player: AudioPlayer;
  connection: VoiceConnection;
  voiceChannelId: string;
  textChannelId: string;
  autoplay: boolean;
  tracks?: Track[];
  history?: Track[];
  currentTrack?: Track | null;
}

export class GuildQueue {
  readonly guildId: string;
  readonly player: AudioPlayer;
  readonly connection: VoiceConnection;
  readonly voiceChannelId: string;
  readonly textChannelId: string;
  tracks: Track[];
  history: Track[];
  currentTrack: Track | null;
  autoplay: boolean;
  idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private resumePositionSeconds = 0;
  private playbackOffsetSeconds = 0;
  private startPaused = false;

  constructor(
    private readonly manager: QueueManager,
    {
      guildId,
      player,
      connection,
      voiceChannelId,
      textChannelId,
      autoplay,
      tracks = [],
      history = [],
      currentTrack = null,
    }: GuildQueueOptions,
  ) {
    this.guildId = guildId;
    this.player = player;
    this.connection = connection;
    this.voiceChannelId = voiceChannelId;
    this.textChannelId = textChannelId;
    this.autoplay = autoplay;
    this.tracks = tracks;
    this.history = history;
    this.currentTrack = currentTrack;

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });

    this.player.on("error", (error) => {
      console.error(`[Queue ${this.guildId}] Player error:`, error.message);
      this.playNext();
    });
  }

  enqueue(track: Track): number {
    this.tracks.push(track);

    if (!this.currentTrack && this.player.state.status === AudioPlayerStatus.Idle) {
      this.playNext();
    } else {
      this.persist();
    }

    return this.tracks.length;
  }

  playNext(): Track | null {
    this.clearIdleTimeout();

    if (this.currentTrack) {
      this.history.push(this.currentTrack);
    }

    while (this.tracks.length > 0) {
      const next = this.tracks.shift()!;
      const startSeconds = this.resumePositionSeconds;
      const startPaused = this.startPaused;
      this.currentTrack = next;
      this.playbackOffsetSeconds = startSeconds;
      this.resumePositionSeconds = 0;
      this.startPaused = false;

      try {
        const resource = createTrackResource(next, startSeconds);
        this.player.play(resource);
        if (startPaused) this.player.pause();
        this.persist();
        return next;
      } catch (error) {
        console.error(
          `[Queue ${this.guildId}] Failed to create resource for "${next.title}":`,
          error,
        );
        this.clearCurrent();
      }
    }

    this.clearCurrent();

    if (this.autoplay && this.history.length > 0) {
      this.handleAutoplay();
      return null;
    }

    this.persist();
    this.startIdleTimeout();
    return null;
  }

  skip(count = 1): { skipped: Track[]; next: Track | null } {
    if (!this.currentTrack) return { skipped: [], next: null };

    const skipped: Track[] = [this.currentTrack];
    this.history.push(this.currentTrack);
    this.clearCurrent();

    const toDrop = Math.min(count - 1, this.tracks.length);
    if (toDrop > 0) {
      skipped.push(...this.tracks.splice(0, toDrop));
    }

    this.persist();
    this.player.stop(); // triggers Idle → playNext

    return { skipped, next: this.tracks[0] ?? null };
  }

  destroy(): void {
    this.reset();
    leaveChannel(this.connection, this.player);
    this.manager.unregister(this.guildId);
    this.manager.deletePersistedQueue(this.guildId);
  }

  handleExternalDestroyed(): void {
    this.reset();
    this.manager.unregister(this.guildId);
    this.manager.deletePersistedQueue(this.guildId);
  }

  pause(): boolean {
    const paused = this.player.pause();
    if (paused) {
      this.persist();
    }
    return paused;
  }

  resume(): boolean {
    const resumed = this.player.unpause();
    if (resumed) {
      this.persist();
    }
    return resumed;
  }

  shuffle(): number {
    const arr = this.tracks;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }

    this.persist();
    return arr.length;
  }

  remove(position: number): Track | null {
    const index = position - 1;
    if (index < 0 || index >= this.tracks.length) return null;

    const [removed] = this.tracks.splice(index, 1);
    this.persist();
    return removed ?? null;
  }

  unskip(): Track | null {
    if (this.history.length === 0) return null;

    if (this.currentTrack) {
      this.tracks.unshift(this.currentTrack);
    }

    const prev = this.history.pop()!;
    this.clearCurrent();
    this.currentTrack = prev;
    this.clearIdleTimeout();

    try {
      const resource = createTrackResource(prev);
      this.player.play(resource);
      this.persist();
      return prev;
    } catch (error) {
      console.error(
        `[Queue ${this.guildId}] Failed to create resource for "${prev.title}":`,
        error,
      );
      this.clearCurrent();
      this.playNext();
      return null;
    }
  }

  clear(): number {
    const count = this.tracks.length;
    this.tracks = [];
    this.persist();
    return count;
  }

  setAutoplay(value: boolean): void {
    this.autoplay = value;

    db.insert(guildSettings)
      .values({ guildId: this.guildId, autoplay: value })
      .onConflictDoUpdate({ target: guildSettings.guildId, set: { autoplay: value } })
      .run();
  }

  getInfo(): QueueInfo {
    return {
      currentTrack: this.currentTrack,
      playbackSeconds: this.getCurrentPlaybackSeconds(),
      upcoming: [...this.tracks],
      size: this.tracks.length,
    };
  }

  getCurrentPlaybackSeconds(): number {
    const state = this.player.state;
    if (state.status === AudioPlayerStatus.Playing || state.status === AudioPlayerStatus.Paused) {
      return this.playbackOffsetSeconds + Math.floor(state.playbackDuration / 1000);
    }

    return this.currentTrack ? this.resumePositionSeconds : 0;
  }

  isPaused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused || this.startPaused;
  }

  restoreState(tracks: Track[], history: Track[], resume: ResumeState | null): void {
    this.currentTrack = null;
    this.tracks = resume ? [resume.track, ...tracks] : tracks;
    this.history = history;
    this.resumePositionSeconds = resume?.positionSeconds ?? 0;
    this.playbackOffsetSeconds = 0;
    this.startPaused = resume?.paused ?? false;
  }

  private persist(): void {
    this.manager.persistQueue(this);
  }

  private reset(): void {
    this.clearIdleTimeout();
    this.tracks = [];
    this.history = [];
    this.clearCurrent();
  }

  private clearCurrent(): void {
    this.currentTrack = null;
    this.playbackOffsetSeconds = 0;
    this.resumePositionSeconds = 0;
    this.startPaused = false;
  }

  private clearIdleTimeout(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  private startIdleTimeout(): void {
    this.clearIdleTimeout();
    this.idleTimeout = setTimeout(() => this.destroy(), IDLE_TIMEOUT_MS);
  }

  private isActive(): boolean {
    return this.manager.get(this.guildId) === this && !this.currentTrack && this.tracks.length === 0;
  }

  private handleAutoplay(): void {
    const seed = this.history[this.history.length - 1]!;

    this.getAutoplayTrack(seed, this.history)
      .then((track) => {
        if (!this.isActive()) return;

        if (!track) {
          console.warn(`[Autoplay ${this.guildId}] No recommendation found, starting idle timer`);
          this.startIdleTimeout();
          return;
        }

        this.tracks.push(track);
        this.playNext();
      })
      .catch((error) => {
        console.error(`[Autoplay ${this.guildId}] Error:`, error);
        if (this.isActive()) this.startIdleTimeout();
      });
  }

  private async getAutoplayTrack(seed: Track, history: Track[]): Promise<Track | null> {
    try {
      const youtube = registry.get("youtube") as YouTubeProvider;
      const videoId = YouTubeProvider.extractVideoId(seed.youtubeUrl);
      if (!videoId) return null;

      const played = new Set(
        history.map((track) => YouTubeProvider.extractVideoId(track.youtubeUrl)).filter(Boolean),
      );

      const results = await youtube.getRelated(videoId);
      const pick = results.find((result) => !played.has(result.id));
      if (pick) {
        return await youtube.resolve(pick, seed.requestedBy);
      }
    } catch (error) {
      console.error("[Autoplay] YouTube related videos failed:", error);
    }

    return null;
  }
}

export class QueueManager {
  private queues = new Map<string, GuildQueue>();
  private checkpointTimer = setInterval(() => {
    for (const queue of this.queues.values()) {
      this.persistQueue(queue);
    }
  }, POSITION_CHECKPOINT_MS);

  constructor() {
    this.checkpointTimer.unref?.();
  }

  get(guildId: string): GuildQueue | undefined {
    return this.queues.get(guildId);
  }

  getOrCreate(guildId: string, voiceChannel: VoiceBasedChannel, textChannelId: string): GuildQueue {
    const existing = this.queues.get(guildId);
    if (existing) return existing;

    const settings = db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .get();

    const { connection, player } = joinChannel(voiceChannel, () => {
      this.queues.get(guildId)?.handleExternalDestroyed();
    });

    const queue = new GuildQueue(this, {
      guildId,
      player,
      connection,
      voiceChannelId: voiceChannel.id,
      textChannelId,
      autoplay: settings?.autoplay ?? false,
    });

    this.queues.set(guildId, queue);
    return queue;
  }

  destroy(guildId: string): void {
    this.queues.get(guildId)?.destroy();
  }

  async restore(client: Client): Promise<number> {
    const rows = db.select().from(guildQueues).all();
    let restored = 0;

    for (const row of rows) {
      try {
        await client.guilds.fetch(row.guildId);
        const channel = await client.channels.fetch(row.voiceChannelId);

        if (!channel?.isVoiceBased() || !("guildId" in channel) || channel.guildId !== row.guildId) {
          this.deletePersistedQueue(row.guildId);
          continue;
        }

        const queue = this.getOrCreate(row.guildId, channel, row.textChannelId);
        const tracks = row.tracks ?? [];
        const history = row.history ?? [];
        const resume = buildResumeState(row.currentTrack, row.currentPositionSeconds, row.paused);

        if (resume) {
          queue.restoreState(tracks, history, resume);
        } else if (row.currentTrack) {
          queue.restoreState(tracks, [...history, row.currentTrack], null);
        } else {
          queue.restoreState(tracks, history, null);
        }

        if (queue.tracks.length > 0) {
          queue.playNext();
          restored++;
        }
      } catch (error) {
        console.error(`[Restore] Failed to restore queue for guild ${row.guildId}:`, error);
        if (isMissingResourceError(error)) {
          this.deletePersistedQueue(row.guildId);
        }
      }
    }

    return restored;
  }

  persistQueue(queue: GuildQueue): void {
    const values = {
      guildId: queue.guildId,
      voiceChannelId: queue.voiceChannelId,
      textChannelId: queue.textChannelId,
      currentTrack: queue.currentTrack,
      currentPositionSeconds: queue.getCurrentPlaybackSeconds(),
      paused: queue.isPaused(),
      tracks: queue.tracks,
      history: queue.history,
    };

    db.insert(guildQueues)
      .values(values)
      .onConflictDoUpdate({ target: guildQueues.guildId, set: values })
      .run();
  }

  unregister(guildId: string): void {
    this.queues.delete(guildId);
  }

  deletePersistedQueue(guildId: string): void {
    db.delete(guildQueues).where(eq(guildQueues.guildId, guildId)).run();
  }
}

export const queueManager = new QueueManager();
