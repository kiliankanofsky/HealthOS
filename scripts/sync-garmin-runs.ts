import { config } from "dotenv";

import { syncGarminRuns } from "../src/lib/integrations/garmin-runs-import";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";

// Sync von Garmin-Läufen in die lokale DB (run_sessions).
//
// Aufruf:
//   npm run db:sync:garmin-runs                     — letzten 90 Tage
//   npm run db:sync:garmin-runs -- --since=2025-05-25 --until=2026-05-25
//   npm run db:sync:garmin-runs -- --dry-run
//   npm run db:sync:garmin-runs -- --max-pages=20

config({ path: ".env.local" });
config();

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const since =
    getArg("since") ??
    isoDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const until = getArg("until") ?? isoDate(new Date());
  const maxPagesRaw = getArg("max-pages");
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : 50;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    throw new Error("--since muss YYYY-MM-DD sein.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new Error("--until muss YYYY-MM-DD sein.");
  }
  if (!Number.isFinite(maxPages) || maxPages <= 0) {
    throw new Error("--max-pages muss eine positive Zahl sein.");
  }

  console.log("Verbinde mit Garmin Connect...");
  const client = await getGarminClient();
  console.log(
    `${dryRun ? "🟡 DRY-RUN" : "▶"} Run-Sync: since=${since}, until=${until}, maxPages=${maxPages}`,
  );

  const result = await syncGarminRuns({
    client,
    since,
    until,
    maxPages,
    dryRun,
  });

  console.log("\n--- Log ---");
  for (const entry of result.log) {
    const icon =
      entry.level === "error" ? "❌" : entry.level === "warn" ? "⚠️ " : "  ";
    console.log(`${icon} ${entry.message}`);
  }
  console.log("\n--- Summary ---");
  console.log(`  Läufe gescannt: ${result.scanned}`);
  console.log(`  Importiert:     ${result.imported}${dryRun ? " (dry-run)" : ""}`);
  console.log(`  Aktualisiert:   ${result.updated}`);
  console.log(`  Übersprungen:   ${result.skipped}`);
}

main().catch((err) => {
  console.error("❌ Sync fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
