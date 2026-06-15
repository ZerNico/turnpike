import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { config } from "../config.ts";
import * as schema from "./schema.ts";

// bun:sqlite won't create parent directories, so ensure they exist first.
mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = drizzle(config.databasePath, { schema });

await migrate(db, {
  migrationsFolder: Bun.env.DRIZZLE_MIGRATIONS ?? "./drizzle",
});
