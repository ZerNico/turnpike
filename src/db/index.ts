import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { config } from "../config.ts";
import * as schema from "./schema.ts";

export const db = drizzle(config.databasePath, { schema });

await migrate(db, { migrationsFolder: "./drizzle" });
