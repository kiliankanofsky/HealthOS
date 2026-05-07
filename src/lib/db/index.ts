import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// Pfad zur lokalen SQLite-Datei. Liegt außerhalb von /src und ist gitignored.
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "health.db");

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
