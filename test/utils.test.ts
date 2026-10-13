import { describe, expect, test } from "bun:test";
import type { SearchProvider, SearchResult } from "../src/providers/base.ts";
import { YouTubeProvider } from "../src/providers/youtube.ts";
import type { GuildQueue } from "../src/services/queue.ts";
import type { Track } from "../src/types.ts";
import { enqueueMultiple } from "../src/utils.ts";
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
