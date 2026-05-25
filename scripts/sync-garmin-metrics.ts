import { config } from "dotenv";

import { syncGarminDailyMetrics } from "../src/lib/integrations/garmin-metrics";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";

// Sync von Garmin Longevity- + Performance-Metriken (RHR, HRV, Sleep,
// VO2 Max, Race Predictions, Lactate Threshold, Training Status).
//
// Aufruf:
//   npm run db:sync:garmin-metrics                  — nur heute
//   npm run db:sync:garmin-metrics -- --days=14     — letzte 14 Tage (inkl. heute)
//   npm run db:sync:garmin-metrics -- --date=2026-05-20
//   npm run db:sync:garmin-metrics -- --dry-run

config({ path: ".env.local" });
config();

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDateRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(isoDate(d));
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const singleDate = getArg("date");
  const daysRaw = getArg("days");

  let dates: string[];
  if (singleDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(singleDate)) {
      throw new Error("--date muss YYYY-MM-DD sein.");
    }
    dates = [singleDate];
  } else if (daysRaw) {
    const n = Number(daysRaw);
    if (!Number.isFinite(n) || n <= 0 || n > 365) {
      throw new Error("--days muss eine positive Zahl ≤ 365 sein.");
    }
    dates = buildDateRange(n);
  } else {
    dates = [isoDate(new Date())];
  }

  console.log("Verbinde mit Garmin Connect...");
  const client = await getGarminClient();
  console.log(
    `${dryRun ? "🟡 DRY-RUN" : "▶"} Metrics-Sync: ${dates.length} Tag(e) — ${dates[0]} → ${dates[dates.length - 1]}`,
  );

  const result = await syncGarminDailyMetrics({ client, dates, dryRun });

  console.log("\n--- Log ---");
  for (const entry of result.log) {
    const icon =
      entry.level === "error" ? "❌" : entry.level === "warn" ? "⚠️ " : "  ";
    console.log(`${icon} ${entry.message}`);
  }
  console.log(`\n--- Summary ---\n  Tage verarbeitet: ${result.daysProcessed}`);
}

main().catch((err) => {
  console.error("❌ Sync fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
