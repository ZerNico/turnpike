import { EventEmitter } from "node:events";
import { AudioPlayerStatus, VoiceConnectionStatus } from "@discordjs/voice";
import { Collection } from "discord.js";
import type { Track } from "../src/types.ts";

export interface FakeResource {
  track: Track;
  startSeconds: number;
}

type FakePlayerState =
  | { status: AudioPlayerStatus.Idle }
  | { status: AudioPlayerStatus.Buffering; resource: FakeResource }
  | {
      status: AudioPlayerStatus.Playing | AudioPlayerStatus.Paused | AudioPlayerStatus.AutoPaused;
      resource: FakeResource;
      playbackDuration: number;
    };

/**
 * Mirrors the parts of @discordjs/voice's AudioPlayer that GuildQueue relies on,
 * including its quirks: pause() only works while Playing, and a non-forced
 * stop() on a paused player never reaches Idle.
 */
export class FakeAudioPlayer extends EventEmitter {
  private _state: FakePlayerState = { status: AudioPlayerStatus.Idle };

  get state(): FakePlayerState {
    return this._state;
  }

  set state(newState: FakePlayerState) {
    const oldState = this._state;
    this._state = newState;
    this.emit("stateChange", oldState, newState);
    if (oldState.status !== newState.status) {
      this.emit(newState.status, oldState, newState);
    }
  }

  get resource(): FakeResource | null {
    return "resource" in this._state ? this._state.resource : null;
  }

  play(resource: FakeResource): void {
    this.state = { status: AudioPlayerStatus.Buffering, resource };
  }

  pause(): boolean {
    if (this._state.status !== AudioPlayerStatus.Playing) return false;
    this.state = { ...this._state, status: AudioPlayerStatus.Paused };
    return true;
  }

  unpause(): boolean {
    if (this._state.status !== AudioPlayerStatus.Paused) return false;
    this.state = { ...this._state, status: AudioPlayerStatus.Playing };
    return true;
  }

  stop(force = false): boolean {
    if (this._state.status === AudioPlayerStatus.Idle) return false;
    // without force the player waits for silence padding, which is never read
    // while paused
    const paused =
      this._state.status === AudioPlayerStatus.Paused ||
      this._state.status === AudioPlayerStatus.AutoPaused;
    if (force || !paused) {
      this.state = { status: AudioPlayerStatus.Idle };
    }
    return true;
  }

  /** Simulates the stream becoming readable. */
  startPlaying(): void {
    if (this._state.status !== AudioPlayerStatus.Buffering) {
      throw new Error(`Cannot start playing from ${this._state.status}`);
    }
    this.state = {
      status: AudioPlayerStatus.Playing,
      resource: this._state.resource,
      playbackDuration: 0,
    };
  }

  advance(seconds: number): void {
    if (!("playbackDuration" in this._state)) {
      throw new Error(`Cannot advance from ${this._state.status}`);
    }
    this._state.playbackDuration += seconds * 1000;
  }

  autoPause(): void {
    if (this._state.status !== AudioPlayerStatus.Playing) {
      throw new Error(`Cannot auto-pause from ${this._state.status}`);
    }
    this.state = { ...this._state, status: AudioPlayerStatus.AutoPaused };
  }
}

export class FakeVoiceConnection extends EventEmitter {
  state: { status: VoiceConnectionStatus } = { status: VoiceConnectionStatus.Ready };

  destroy(): void {
    if (this.state.status === VoiceConnectionStatus.Destroyed) {
      throw new Error("Cannot destroy VoiceConnection - it has already been destroyed");
    }
    this.state = { status: VoiceConnectionStatus.Destroyed };
    this.emit(VoiceConnectionStatus.Destroyed);
  }
}

export function fakeVoiceChannel(id: string, guildId: string, humans = 1) {
  const members = new Collection<string, { user: { bot: boolean } }>();
  for (let i = 0; i < humans; i++) members.set(`user-${i}`, { user: { bot: false } });
  members.set("bot", { user: { bot: true } });

  return {
    id,
    guildId,
    guild: { id: guildId },
    members,
    isVoiceBased: () => true,
  };
}

export function makeTrack(n: number, duration = 180): Track {
  return {
    title: `Track ${n}`,
    artist: "Artist",
    duration,
    url: `https://www.youtube.com/watch?v=track${String(n).padStart(6, "0")}`,
    youtubeUrl: `https://www.youtube.com/watch?v=track${String(n).padStart(6, "0")}`,
    provider: "youtube",
    requestedBy: "user-0",
  };
}
