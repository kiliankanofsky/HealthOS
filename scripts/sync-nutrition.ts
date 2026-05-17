import { config } from "dotenv";

import { fddbAdapter } from "../src/lib/integrations/fddb";
import { getNutritionForDate, upsertNutritionEntry } from "../src/lib/db/queries";

// Sync von fddb-Tagessummen (kcal + Makros) in die lokale DB.
//
// Aufruf:
//   npm run db:sync:nutrition                          — letzte 7 Tage
//   npm run db:sync:nutrition -- --since=2026-01-01    — ab Datum bis heute
//   npm run db:sync:nutrition -- --since=2026-05-01 --until=2026-05-07
//   npm run db:sync:nutrition -- --dry-run             — nur Vorschau

config({ path: ".env.local" });
config();

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    `${dryRun ? "🟡 DRY-RUN" : "▶"} fddb-Sync: since=${since}${until ? `, until=${until}` : " (bis heute)"}`,
  );

  const entries = await fddbAdapter.fetchNutritionEntries({ since, until });
  console.log(`\nGeholt: ${entries.length} Tage mit Einträgen.`);

  let inserted = 0;
  let updated = 0;
  for (const entry of entries) {
    const existing = await getNutritionForDate(entry.date, "fddb");
    console.log(
      `  ${entry.date}: ${entry.caloriesKcal} kcal · ` +
        `P ${entry.proteinG.toFixed(1)}g · ` +
        `KH ${entry.carbsG.toFixed(1)}g · ` +
        `F ${entry.fatG.toFixed(1)}g` +
        (entry.fiberG !== null && entry.fiberG !== undefined
          ? ` · Ballast ${entry.fiberG.toFixed(1)}g`
          : "") +
        (entry.sugarG !== null && entry.sugarG !== undefined
          ? ` · Zucker ${entry.sugarG.toFixed(1)}g`
          : "") +
        (existing ? "  [update]" : "  [neu]"),
    );
    if (!dryRun) {
      await upsertNutritionEntry(entry);
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
  console.error("❌ Nutrition-Sync fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
