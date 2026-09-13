import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "@/src/env";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

/** Opens a SQLite database and applies migrations. Pass ":memory:" for tests. */
export function openDb(file: string = env.databasePath): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "src/db/migrations") });
  return db;
}

// The web app and the worker each keep one connection per process; the global survives Next.js hot reloads.
const globalForDb = globalThis as unknown as { closerDb?: DB };

export function getDb(): DB {
  globalForDb.closerDb ??= openDb();
  return globalForDb.closerDb;
}
