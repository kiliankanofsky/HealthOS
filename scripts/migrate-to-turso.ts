import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";

// Einmal-Migration: lokale data/health.db → Turso.
// 1. Migrationen gegen Turso laufen lassen (legt Schema an, idempotent).
// 2. Tabellen-Daten von local → Turso kopieren (CLEAR + INSERT für deterministischen Zustand).
//
// Aufruf:
//   npx tsx scripts/migrate-to-turso.ts
// ENV-Variablen müssen gesetzt sein:
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
//
// Nicht-destruktiv für lokale DB — liest nur. Turso-DB wird komplett überschrieben.

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const LOCAL_PATH = `file:${path.join(process.cwd(), "data", "health.db")}`;

if (!TURSO_URL || !TURSO_TOKEN) {
  throw new Error("TURSO_DATABASE_URL und TURSO_AUTH_TOKEN müssen gesetzt sein.");
}

// Reihenfolge wichtig wegen Foreign Keys: parents vor children.
const TABLES_IN_ORDER = [
  "weight_entries",
  "weight_phases",
  "exercises",
  "workout_templates",
  "workout_template_exercises",
  "workout_sessions",
  "workout_sets",
  "session_exercise_overrides",
  "nutrition_entries",
  "daily_activity",
  "garmin_tokens",
] as const;

async function main() {
  console.log(`Quelle:  ${LOCAL_PATH}`);
  console.log(`Ziel:    ${TURSO_URL}`);

  const local = createClient({ url: LOCAL_PATH });
  const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  console.log("\n1/3  Migrationen gegen Turso laufen lassen...");
  const tursoDrizzle = drizzle(turso);
  await migrate(tursoDrizzle, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("     ✓ Migrationen angewendet.");

  console.log("\n2/3  Bestehende Daten in Turso leeren (Reverse-Order)...");
  for (const table of [...TABLES_IN_ORDER].reverse()) {
    await turso.execute(`DELETE FROM ${table}`);
    console.log(`     ✓ ${table} geleert`);
  }

  console.log("\n3/3  Daten kopieren (lokal → Turso)...");
  let totalRows = 0;
  for (const table of TABLES_IN_ORDER) {
    const rows = await local.execute(`SELECT * FROM ${table}`);
    if (rows.rows.length === 0) {
      console.log(`     · ${table}: leer`);
      continue;
    }
    const cols = rows.columns;
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
    for (const row of rows.rows) {
      await turso.execute({
        sql,
        args: cols.map((c) => row[c] as string | number | null),
      });
    }
    console.log(`     ✓ ${table}: ${rows.rows.length} Zeilen`);
    totalRows += rows.rows.length;
  }

  console.log(`\nFertig. ${totalRows} Zeilen insgesamt kopiert.`);
  local.close();
  turso.close();
}

main().catch((err) => {
  console.error("\n❌ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
