import { config } from "dotenv";

import { upsertDailyActivity, getDailyActivityForDate } from "../src/lib/db/queries";
import { fetchDailyCalories } from "../src/lib/integrations/garmin-calories";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";

// Sync von Garmins Tagesgesamtkalorien (Total = BMR + Aktivität) in die DB.
//
// Aufruf:
//   npm run db:sync:garmin-calories                          — letzte 7 Tage
//   npm run db:sync:garmin-calories -- --since=2026-01-01    — ab Datum
//   npm run db:sync:garmin-calories -- --dry-run             — nur Vorschau

config({ path: ".env.local" });
config();

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const since = getArg("since") ?? isoDaysAgo(7);
  const until = getArg("until");

  for (const v of [since, until].filter(Boolean) as string[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new Error(`Datum muss YYYY-MM-DD sein: ${v}`);
    }
  }

  console.log(
    `${dryRun ? "🟡 DRY-RUN" : "▶"} Garmin-Calories-Sync: since=${since}${until ? `, until=${until}` : " (bis heute)"}`,
  );

  const client = await getGarminClient();
  const entries = await fetchDailyCalories(client, { since, until });
  console.log(`\nGeholt: ${entries.length} Tage.`);

  let inserted = 0;
  let updated = 0;
  for (const entry of entries) {
    const existing = getDailyActivityForDate(entry.date, "garmin");
    console.log(
      `  ${entry.date}: ${entry.totalKcal} kcal total` +
        (entry.activeKcal !== null && entry.activeKcal !== undefined
          ? ` (aktiv ${entry.activeKcal}, BMR ${entry.bmrKcal ?? "–"})`
          : "") +
        (entry.steps !== null && entry.steps !== undefined
          ? ` · ${entry.steps} Schritte`
          : "") +
        (existing ? "  [update]" : "  [neu]"),
    );
    if (!dryRun) {
      upsertDailyActivity(entry);
      if (existing) updated++;
      else inserted++;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`  Tage gescannt:  ${entries.length}`);
  if (dryRun) {
    console.log(`  (dry-run — nichts geschrieben)`);
  } else {
    console.log(`  Neu eingefügt:  ${inserted}`);
    console.log(`  Aktualisiert:   ${updated}`);
  }
}

main().catch((err) => {
  console.error("❌ Garmin-Calories-Sync fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
