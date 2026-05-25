import "dotenv/config";

import { createClient } from "@libsql/client";

// One-shot Turso-Status-Check: zeigt, ob die Endurance- und Tag-Tabellen
// nach der letzten Migration sauber angekommen sind. Nicht in package.json
// — direkt mit `npx tsx scripts/check-turso.ts` ausführen.

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN nicht gesetzt (env nicht geladen?).",
    );
  }
  const client = createClient({ url, authToken: token });

  const tags = await client.execute("SELECT count(*) as n FROM daily_tags");
  const we = await client.execute("PRAGMA table_info(weight_entries)");
  const dt = await client.execute("PRAGMA table_info(daily_tags)");
  const runs = await client.execute(
    "SELECT count(*) as n FROM run_sessions",
  );
  const metrics = await client.execute(
    "SELECT count(*) as n FROM garmin_daily_metrics",
  );

  console.log("daily_tags row count:", tags.rows[0].n);
  console.log("run_sessions row count:", runs.rows[0].n);
  console.log("garmin_daily_metrics row count:", metrics.rows[0].n);
  console.log(
    "weight_entries cols:",
    we.rows.map((r) => (r as Record<string, unknown>).name).join(", "),
  );
  console.log(
    "daily_tags cols:",
    dt.rows.map((r) => (r as Record<string, unknown>).name).join(", "),
  );

  const breakdown = await client.execute(
    "SELECT sum(cheat_day) as cheat, sum(alcohol) as alc, sum(cheat_meal) as meal FROM daily_tags",
  );
  console.log("Tag breakdown:", breakdown.rows[0]);

  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
