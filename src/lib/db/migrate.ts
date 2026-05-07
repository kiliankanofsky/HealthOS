import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "health.db");
const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

console.log("Running migrations against", DB_PATH);
migrate(db, { migrationsFolder: MIGRATIONS_DIR });
console.log("Migrations applied.");

sqlite.close();
