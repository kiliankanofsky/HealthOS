import { config } from "dotenv";

import { syncGarminStrength } from "../src/lib/integrations/garmin-strength-import";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";

// Sync von Garmin-Krafttrainings in die lokale DB.
//
// Aufruf:
//   npm run db:sync:garmin                        — letzte 200 Aktivitäten, alles importieren
//   npm run db:sync:garmin -- --dry-run           — nur Vorschau, nichts schreiben
//   npm run db:sync:garmin -- --since=2026-01-01  — nur Sessions ab Datum
//   npm run db:sync:garmin -- --limit=100         — wie viele Aktivitäten Garmin liefert

config({ path: ".env.local" });
config();

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const since = getArg("since");
  const limitRaw = getArg("limit");
  const fetchLimit = limitRaw ? Number(limitRaw) : 200;
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    throw new Error("--since muss YYYY-MM-DD sein.");
  }
  if (!Number.isFinite(fetchLimit) || fetchLimit <= 0) {
    throw new Error("--limit muss eine positive Zahl sein.");
  }

  console.log("Verbinde mit Garmin Connect...");
  const client = await getGarminClient();
  console.log(
    `${dryRun ? "🟡 DRY-RUN" : "▶"} Sync: limit=${fetchLimit}${since ? `, since=${since}` : ""}`,
  );

  const result = await syncGarminStrength({ client, fetchLimit, since, dryRun });

  console.log("\n--- Log ---");
  for (const entry of result.log) {
    const icon = entry.level === "error" ? "❌" : entry.level === "warn" ? "⚠️ " : "  ";
    console.log(`${icon} ${entry.message}`);
  }
  console.log("\n--- Summary ---");
  console.log(`  Strength-Sessions gescannt: ${result.scanned}`);
  console.log(`  Importiert:                 ${result.imported}${dryRun ? " (dry-run)" : ""}`);
  console.log(`  Bereits da (skip):          ${result.skippedAlreadyImported}`);
  console.log(`  Konflikt mit manueller:     ${result.skippedConflict}`);
  console.log(`  Nicht zugeordnet:           ${result.skippedUnassigned}`);
}

main().catch((err) => {
  console.error("❌ Sync fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
