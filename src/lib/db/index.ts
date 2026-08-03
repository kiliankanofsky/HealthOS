import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { isDemoRequest } from "@/lib/demo/config";
import * as schema from "./schema";

// Auf Vercel (oder wenn USE_TURSO=1) → remote Turso-DB. Lokal default → file-URL
// auf data/health.db, damit Dev-Setup ohne Cloud-Roundtrip funktioniert.
const useTurso = Boolean(process.env.VERCEL) || process.env.USE_TURSO === "1";

export type HealthDb = LibSQLDatabase<typeof schema>;

function localFileUrl(fileName: string): string {
  const dir = path.join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return `file:${path.join(dir, fileName)}`;
}

const url = useTurso ? process.env.TURSO_DATABASE_URL : localFileUrl("health.db");

if (!url) {
  throw new Error(
    "TURSO_DATABASE_URL fehlt — auf Vercel als Environment Variable setzen.",
  );
}

const client = createClient({
  url,
  authToken: useTurso ? process.env.TURSO_AUTH_TOKEN : undefined,
});

/**
 * Die echte Datenbank. Direkt benutzen nur Dinge, die IMMER auf die echten
 * Daten müssen (Better Auth, Migrationen). Alles andere geht über `getDb()`,
 * damit der öffentliche Demo-Modus auf die Demo-DB umschalten kann.
 */
export const db: HealthDb = drizzle(client, { schema });

// --- Demo-DB (öffentlicher Modus, siehe src/lib/demo/config.ts) ------------

let demoClient: Client | null = null;
let demoDb: HealthDb | null = null;

/**
 * Eigene, komplett getrennte Datenbank für den Demo-Modus. Lazy, damit eine
 * fehlende Konfiguration die App nicht beim Import zerlegt.
 */
export function getDemoDb(): HealthDb {
  if (demoDb) return demoDb;

  const demoUrl = useTurso
    ? process.env.TURSO_DEMO_DATABASE_URL
    : localFileUrl("demo.db");

  if (!demoUrl) {
    throw new Error(
      "TURSO_DEMO_DATABASE_URL fehlt — Demo-Modus ist nicht konfiguriert.",
    );
  }

  demoClient = createClient({
    url: demoUrl,
    authToken: useTurso ? process.env.TURSO_DEMO_AUTH_TOKEN : undefined,
  });
  demoDb = drizzle(demoClient, { schema });
  return demoDb;
}

/**
 * Die für diesen Request zuständige Datenbank. Ohne Demo-Cookie (und in allen
 * Kontexten ohne Request, z.B. Sync-Skripte) ist das die echte DB.
 */
export async function getDb(): Promise<HealthDb> {
  return (await isDemoRequest()) ? getDemoDb() : db;
}

export { schema };
