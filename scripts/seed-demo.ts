// Baut die Demo-Datenbank neu auf (Schema-Migration + Mock-Daten).
//
//   npm run db:seed:demo                    → lokal, data/demo.db
//   USE_TURSO=1 npm run db:seed:demo        → gegen TURSO_DEMO_DATABASE_URL
//
// Hinweis für Turso: dotenv lädt hier .env.local explizit, weil die Vars
// sonst (wie beim migrate-Script) fehlen würden.

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
config();

// Erwarteter Konfigurationsfehler — wird ohne Stacktrace ausgegeben, weil die
// Nachricht selbst die Anleitung ist.
class SetupError extends Error {}

async function main() {
  const useTurso = process.env.USE_TURSO === "1";

  let url: string;
  let authToken: string | undefined;

  if (useTurso) {
    const remote = process.env.TURSO_DEMO_DATABASE_URL;
    if (!remote) {
      throw new SetupError(
        "TURSO_DEMO_DATABASE_URL fehlt. Erst eine eigene Demo-DB anlegen:\n" +
          "  turso auth login\n" +
          "  turso db create healthos-demo\n" +
          "  turso db show healthos-demo --url     # → TURSO_DEMO_DATABASE_URL\n" +
          "  turso db tokens create healthos-demo  # → TURSO_DEMO_AUTH_TOKEN\n" +
          "Beide Werte in .env.local (und in Vercel) eintragen, dann erneut ausführen.",
      );
    }
    url = remote;
    authToken = process.env.TURSO_DEMO_AUTH_TOKEN;
  } else {
    const dir = path.join(process.cwd(), "data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    url = `file:${path.join(dir, "demo.db")}`;
  }

  // Migrationen zuerst — die Demo-DB hat dasselbe Schema wie die echte.
  console.log(`Migrationen → ${useTurso ? "Turso (Demo)" : "data/demo.db"}`);
  const migrationClient = createClient({ url, authToken });
  await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  migrationClient.close();

  // Erst NACH der Migration importieren: das Modul baut beim Laden seinen
  // eigenen Client auf und würde sonst auf ein leeres Schema treffen.
  const { seedDemoDatabase } = await import("../src/lib/demo/seed");
  const { todayBerlinISO } = await import("../src/lib/utils/date");

  const today = todayBerlinISO();
  console.log(`Seed für Anker-Datum ${today} …`);
  const result = await seedDemoDatabase(today);
  console.log(`Fertig: ${result.rows} Zeilen in ${result.tables} Tabellen.`);
}

main().catch((error) => {
  console.error(error instanceof SetupError ? `\n${error.message}\n` : error);
  process.exit(1);
});
