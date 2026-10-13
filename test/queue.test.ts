import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AudioPlayerStatus, VoiceConnectionStatus } from "@discordjs/voice";
import { eq } from "drizzle-orm";
import type { Track } from "../src/types.ts";
import {
  FakeAudioPlayer,
  FakeVoiceConnection,
  fakeVoiceChannel,
  makeTrack,
  type FakeResource,
} from "./fakes.ts";

let lastJoin: { player: FakeAudioPlayer; connection: FakeVoiceConnection } | null = null;

mock.module("../src/services/player.ts", () => ({
  createTrackResource: (track: Track, startSeconds = 0): FakeResource => ({ track, startSeconds }),
}));

mock.module("../src/services/voice.ts", () => ({
  joinChannel: (_channel: unknown, onDestroyed?: () => void) => {
    const player = new FakeAudioPlayer();
    const connection = new FakeVoiceConnection();
    if (onDestroyed) connection.on("destroyed", onDestroyed);
    lastJoin = { player, connection };
    return { player, connection };
  },
  leaveChannel: (connection: FakeVoiceConnection, player: FakeAudioPlayer) => {
    player.stop(true);
    connection.destroy();
  },
}));

const { QueueManager } = await import("../src/services/queue.ts");
const { db } = await import("../src/db/index.ts");
const { guildQueues } = await import("../src/db/schema.ts");

const GUILD = "guild-1";
const VOICE = "voice-1";
const TEXT = "text-1";

let manager: InstanceType<typeof QueueManager>;

function createQueue(humans = 1) {
  const channel = fakeVoiceChannel(VOICE, GUILD, humans);
  // oxlint-disable-next-line typescript/no-explicit-any -- structural fake
  const queue = manager.getOrCreate(GUILD, channel as any, TEXT);
  const { player, connection } = lastJoin!;
  return { queue, player, connection };
}

function persistedRow() {
  return db.select().from(guildQueues).where(eq(guildQueues.guildId, GUILD)).get();
}

beforeEach(() => {
  // shutdown persists the previous test's sessions, so clear the table after
  manager?.shutdown();
  db.delete(guildQueues).run();
  manager = new QueueManager();
});

describe("playback", () => {
  test("enqueue on an idle queue starts playing, later tracks wait", () => {
    const { queue, player } = createQueue();

    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));

    expect(queue.currentTrack?.title).toBe("Track 1");
    expect(player.state.status).toBe(AudioPlayerStatus.Buffering);
    expect(queue.tracks.map((t) => t.title)).toEqual(["Track 2"]);
  });

  test("skip reports and plays the next track", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));
    queue.enqueue(makeTrack(3));
    player.startPlaying();

    const { skipped, next } = queue.skip();

    expect(skipped.map((t) => t.title)).toEqual(["Track 1"]);
    expect(next?.title).toBe("Track 2");
    expect(queue.currentTrack?.title).toBe("Track 2");
    expect(player.resource?.track.title).toBe("Track 2");
  });

  test("skip while paused still advances", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));
    player.startPlaying();
    queue.pause();

    queue.skip();

    expect(queue.currentTrack?.title).toBe("Track 2");
    expect(player.state.status).toBe(AudioPlayerStatus.Buffering);
  });

  test("skip with a count drops the following tracks", () => {
    const { queue, player } = createQueue();
    for (let i = 1; i <= 4; i++) queue.enqueue(makeTrack(i));
    player.startPlaying();

    const { skipped, next } = queue.skip(3);

    expect(skipped.map((t) => t.title)).toEqual(["Track 1", "Track 2", "Track 3"]);
    expect(next?.title).toBe("Track 4");
    expect(queue.currentTrack?.title).toBe("Track 4");
  });

  test("finishing the last track goes idle and arms the idle timeout", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));
    player.startPlaying();

    player.stop();

    expect(queue.currentTrack).toBeNull();
    expect(queue.history.map((t) => t.title)).toEqual(["Track 1"]);
    expect(queue.idleTimeout).not.toBeNull();
  });

  test("unskip replays the previous track and requeues the current one", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));
    player.startPlaying();
    queue.skip();

    const replayed = queue.unskip();

    expect(replayed?.title).toBe("Track 1");
    expect(queue.currentTrack?.title).toBe("Track 1");
    expect(queue.tracks.map((t) => t.title)).toEqual(["Track 2"]);
  });

  test("history is capped", () => {
    const { queue, player } = createQueue();
    for (let i = 1; i <= 105; i++) queue.enqueue(makeTrack(i));

    for (let i = 0; i < 104; i++) {
      player.startPlaying();
      player.stop();
    }

    expect(queue.currentTrack?.title).toBe("Track 105");
    expect(queue.history).toHaveLength(100);
    expect(queue.history[0]?.title).toBe("Track 5");
  });
});

describe("pausing", () => {
  test("a pause requested while buffering applies once playback starts", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));

    expect(queue.pause()).toBe(true);
    expect(queue.isPaused()).toBe(true);

    player.startPlaying();

    expect(player.state.status).toBe(AudioPlayerStatus.Paused);
  });

  test("resuming before playback starts cancels the pending pause", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.pause();

    expect(queue.resume()).toBe(true);
    player.startPlaying();

    expect(player.state.status).toBe(AudioPlayerStatus.Playing);
    expect(queue.isPaused()).toBe(false);
  });

  test("a pending pause does not carry over to the next track", () => {
    const { queue, player } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));
    queue.pause();

    queue.skip();
    player.startPlaying();

    expect(player.state.status).toBe(AudioPlayerStatus.Playing);
  });
});

describe("playback position", () => {
  test("counts from the resume offset while buffering, playing and auto-paused", () => {
    const { queue, player } = createQueue();
    queue.restoreState([], [], { track: makeTrack(1), positionSeconds: 90, paused: false });
    queue.playNext();

    expect(player.resource?.startSeconds).toBe(90);
    expect(queue.getCurrentPlaybackSeconds()).toBe(90);

    player.startPlaying();
    player.advance(15);
    expect(queue.getCurrentPlaybackSeconds()).toBe(105);

    player.autoPause();
    expect(queue.getCurrentPlaybackSeconds()).toBe(105);
  });

  test("is zero with nothing playing", () => {
    const { queue } = createQueue();
    expect(queue.getCurrentPlaybackSeconds()).toBe(0);
  });
});

describe("teardown", () => {
  test("destroy stops playback, leaves voice and forgets the session", () => {
    const { queue, player, connection } = createQueue();
    queue.enqueue(makeTrack(1));
    player.startPlaying();

    queue.destroy();

    expect(player.state.status).toBe(AudioPlayerStatus.Idle);
    expect(connection.state.status).toBe(VoiceConnectionStatus.Destroyed);
    expect(manager.get(GUILD)).toBeUndefined();
    expect(persistedRow()).toBeUndefined();
    expect(queue.idleTimeout).toBeNull();
    expect(queue.isDestroyed()).toBe(true);
  });

  test("an external disconnect stops the player and forgets the session", () => {
    const { queue, player, connection } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));
    player.startPlaying();

    connection.destroy();

    expect(player.state.status).toBe(AudioPlayerStatus.Idle);
    expect(queue.currentTrack).toBeNull();
    expect(manager.get(GUILD)).toBeUndefined();
    expect(persistedRow()).toBeUndefined();
  });

  test("suspend leaves voice but keeps the session and its position", () => {
    const { queue, player, connection } = createQueue();
    queue.enqueue(makeTrack(1));
    queue.enqueue(makeTrack(2));
    player.startPlaying();
    player.advance(42);

    manager.shutdown();

    expect(connection.state.status).toBe(VoiceConnectionStatus.Destroyed);
    expect(manager.get(GUILD)).toBeUndefined();
    expect(queue.isDestroyed()).toBe(true);

    const row = persistedRow();
    expect(row?.currentTrack?.title).toBe("Track 1");
    expect(row?.currentPositionSeconds).toBe(42);
    expect(row?.tracks.map((t) => t.title)).toEqual(["Track 2"]);
  });
});

describe("voice channel", () => {
  test("follows the bot when it is moved", () => {
    const { queue } = createQueue();
    queue.enqueue(makeTrack(1));

    queue.setVoiceChannel("voice-2");

    expect(queue.voiceChannelId).toBe("voice-2");
    expect(persistedRow()?.voiceChannelId).toBe("voice-2");
  });
});

describe("restore", () => {
  function fakeClient() {
    return {
      guilds: { fetch: async () => ({}) },
      channels: { fetch: async () => fakeVoiceChannel(VOICE, GUILD) },
    };
  }

  function insertRow(values: Partial<typeof guildQueues.$inferInsert>) {
    db.insert(guildQueues)
      .values({ guildId: GUILD, voiceChannelId: VOICE, textChannelId: TEXT, ...values })
      .run();
  }

  test("resumes a paused session paused, at its saved position", async () => {
    insertRow({
      currentTrack: makeTrack(1),
      currentPositionSeconds: 60,
      paused: true,
      tracks: [makeTrack(2)],
    });

    // oxlint-disable-next-line typescript/no-explicit-any -- structural fake
    const restored = await manager.restore(fakeClient() as any);
    const queue = manager.get(GUILD)!;
    const { player } = lastJoin!;

    expect(restored).toBe(1);
    expect(queue.currentTrack?.title).toBe("Track 1");
    expect(player.resource?.startSeconds).toBe(60);
    expect(queue.isPaused()).toBe(true);

    player.startPlaying();
    expect(player.state.status).toBe(AudioPlayerStatus.Paused);
  });

  test("drops a session with nothing left to play without rejoining", async () => {
    insertRow({ history: [makeTrack(1)] });
    lastJoin = null;

    // oxlint-disable-next-line typescript/no-explicit-any -- structural fake
    const restored = await manager.restore(fakeClient() as any);

    expect(restored).toBe(0);
    expect(lastJoin).toBeNull();
    expect(manager.get(GUILD)).toBeUndefined();
    expect(persistedRow()).toBeUndefined();
  });
});
