import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// Default: lokale Datei. Setze USE_TURSO=1 (mit TURSO_DATABASE_URL+TOKEN gesetzt),
// um Migrationen gegen die Cloud-DB laufen zu lassen.
const useTurso = process.env.USE_TURSO === "1";

const url = useTurso
  ? process.env.TURSO_DATABASE_URL
  : `file:${path.join(process.cwd(), "data", "health.db")}`;

if (!url) {
  throw new Error("TURSO_DATABASE_URL fehlt (USE_TURSO=1 gesetzt).");
}

if (!useTurso) {
  const dir = path.join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const client = createClient({
  url,
  authToken: useTurso ? process.env.TURSO_AUTH_TOKEN : undefined,
});
const db = drizzle(client);

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function main() {
  console.log("Running migrations against", useTurso ? url : "local file");
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log("Migrations applied.");
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
