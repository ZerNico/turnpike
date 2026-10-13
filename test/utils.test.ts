import { describe, expect, test } from "bun:test";
import type { SearchProvider, SearchResult } from "../src/providers/base.ts";
import { YouTubeProvider } from "../src/providers/youtube.ts";
import type { GuildQueue } from "../src/services/queue.ts";
import type { Track } from "../src/types.ts";
import { autocompleteQueuePosition, enqueueMultiple, parseTimestamp } from "../src/utils.ts";
import type { QueueManager } from "../src/services/queue.ts";
import { makeTrack } from "./fakes.ts";

function results(count: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    title: `Track ${i + 1}`,
    artist: "Artist",
    duration: 180,
    url: `https://example.com/${i + 1}`,
    provider: "test",
  }));
}

function fakeQueue() {
  const enqueued: Track[] = [];
  let destroyed = false;
  const queue = {
    enqueue: (track: Track) => enqueued.push(track),
    isDestroyed: () => destroyed,
  } as unknown as GuildQueue;
  return { queue, enqueued, destroy: () => (destroyed = true) };
}

describe("enqueueMultiple", () => {
  test("keeps the original order and counts failures", async () => {
    const { queue, enqueued } = fakeQueue();
    const provider = {
      // resolve out of order, and fail every fifth track
      resolve: async (result: SearchResult) => {
        const n = Number(result.id);
        await Bun.sleep((20 - n) % 7);
        if (n % 5 === 0) throw new Error("no match");
        return makeTrack(n);
      },
    } as unknown as SearchProvider;

    const result = await enqueueMultiple(queue, results(20), provider, "user");

    expect(result).toEqual({ added: 16, failed: 4, stopped: false });
    expect(enqueued.map((t) => t.title)).toEqual(
      results(20)
        .filter((_, i) => (i + 1) % 5 !== 0)
        .map((r) => r.title),
    );
  });

  test("stops once the queue is destroyed", async () => {
    const { queue, enqueued, destroy } = fakeQueue();
    let resolved = 0;
    const provider = {
      resolve: async (result: SearchResult) => {
        if (++resolved === 8) destroy();
        return makeTrack(Number(result.id));
      },
    } as unknown as SearchProvider;

    const result = await enqueueMultiple(queue, results(40), provider, "user");

    expect(result.stopped).toBe(true);
    expect(enqueued).toHaveLength(0);
    expect(resolved).toBe(8);
  });
});

describe("YouTubeProvider.isPlaylistUrl", () => {
  test.each([
    ["https://www.youtube.com/playlist?list=PLabcdef123", true],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdef123", true],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ", false],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", false],
  ])("%s → %p", (url, expected) => {
    expect(YouTubeProvider.isPlaylistUrl(url)).toBe(expected);
  });
});

describe("parseTimestamp", () => {
  test.each([
    ["90", 90],
    ["1:30", 90],
    ["01:02:03", 3723],
    [" 0:05 ", 5],
    ["", null],
    ["1:", null],
    ["-5", null],
    ["1.5", null],
    ["1:2:3:4", null],
    ["abc", null],
  ])("%p → %p", (input, expected) => {
    expect(parseTimestamp(input)).toBe(expected);
  });
});

describe("autocompleteQueuePosition", () => {
  async function suggest(typed: string, trackCount: number) {
    let choices: { name: string; value: number }[] = [];
    const interaction = {
      guildId: "guild",
      options: { getFocused: () => typed },
      respond: async (c: typeof choices) => {
        choices = c;
      },
    };
    const manager = {
      get: () => ({ tracks: Array.from({ length: trackCount }, (_, i) => makeTrack(i + 1)) }),
    };
    // oxlint-disable-next-line typescript/no-explicit-any -- structural fakes
    await autocompleteQueuePosition(interaction as any, manager as unknown as QueueManager);
    return choices;
  }

  test("lists positions, capped at 25", async () => {
    const choices = await suggest("", 30);
    expect(choices).toHaveLength(25);
    expect(choices[0]).toEqual({ name: "1. Track 1 — Artist", value: 1 });
  });

  test("matches by position prefix or title", async () => {
    // "Track 12" matches by title
    expect((await suggest("2", 30)).map((c) => c.value)).toEqual([
      2, 12, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    ]);
    expect((await suggest("track 7", 30)).map((c) => c.value)).toEqual([7]);
  });
});
