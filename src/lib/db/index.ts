import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// Auf Vercel (oder wenn USE_TURSO=1) → remote Turso-DB. Lokal default → file-URL
// auf data/health.db, damit Dev-Setup ohne Cloud-Roundtrip funktioniert.
const useTurso = Boolean(process.env.VERCEL) || process.env.USE_TURSO === "1";

const url = useTurso
  ? process.env.TURSO_DATABASE_URL
  : `file:${path.join(process.cwd(), "data", "health.db")}`;

if (!url) {
  throw new Error(
    "TURSO_DATABASE_URL fehlt — auf Vercel als Environment Variable setzen.",
  );
}

if (!useTurso) {
  const dir = path.join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const client = createClient({
  url,
  authToken: useTurso ? process.env.TURSO_AUTH_TOKEN : undefined,
});

export const db = drizzle(client, { schema });
export { schema };
