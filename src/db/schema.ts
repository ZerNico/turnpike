import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Track } from "../types.ts";

export const guildSettings = sqliteTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),
  autoplay: integer("autoplay", { mode: "boolean" }).notNull().default(false),
  sponsorblockEnabled: integer("sponsorblock_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const guildQueues = sqliteTable("guild_queues", {
  guildId: text("guild_id").primaryKey(),
  voiceChannelId: text("voice_channel_id").notNull(),
  textChannelId: text("text_channel_id").notNull(),
  currentTrack: text("current_track", { mode: "json" }).$type<Track>(),
  currentPositionSeconds: integer("current_position_seconds").notNull().default(0),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  tracks: text("tracks", { mode: "json" })
    .$type<Track[]>()
    .notNull()
    .default(sql`'[]'`),
  history: text("history", { mode: "json" })
    .$type<Track[]>()
    .notNull()
    .default(sql`'[]'`),
});
