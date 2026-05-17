import { GarminConnect } from "@gooin/garmin-connect";

import type { NewDailyActivity } from "@/lib/db/schema";

// Tägliche Kalorien-Bilanz aus Garmin Connect.
// Endpoint ist undokumentiert (`usersummary-service/usersummary/daily/{displayName}`)
// und liefert dieselbe Zahl, die die Garmin-App unter
//   connect.garmin.com/app/calories/<date>
// als "Total" anzeigt — inkl. BMR + Aktivität + Workouts + NEAT.

const BASE_URL = "https://connectapi.garmin.com/usersummary-service/usersummary/daily";

type DailySummary = {
  calendarDate?: string;
  totalKilocalories?: number;
  activeKilocalories?: number;
  bmrKilocalories?: number;
  totalSteps?: number;
};

function* iterateDates(since: string, until: string): Generator<string> {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (start > end) return;
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    yield `${y}-${m}-${d}`;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function fetchDailyCalories(
  client: GarminConnect,
  options: { since: string; until?: string },
): Promise<NewDailyActivity[]> {
  const profile = await client.getUserProfile();
  const displayName = (profile as { displayName?: string }).displayName;
  if (!displayName) throw new Error("Garmin profile.displayName fehlt.");

  const endDate = options.until ?? todayIso();
  const entries: NewDailyActivity[] = [];
  const failed: { date: string; reason: string }[] = [];

  for (const date of iterateDates(options.since, endDate)) {
    try {
      const url = `${BASE_URL}/${displayName}?calendarDate=${date}`;
      const data = await client.get<DailySummary>(url);
      const total = data.totalKilocalories;
      if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) {
        // Tag ohne Daten (z.B. Watch nicht getragen) — überspringen.
        continue;
      }
      entries.push({
        date,
        source: "garmin",
        totalKcal: Math.round(total),
        activeKcal:
          typeof data.activeKilocalories === "number"
            ? Math.round(data.activeKilocalories)
            : null,
        bmrKcal:
          typeof data.bmrKilocalories === "number"
            ? Math.round(data.bmrKilocalories)
            : null,
        steps:
          typeof data.totalSteps === "number" ? Math.round(data.totalSteps) : null,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ date, reason });
      console.warn(`⚠️  ${date} übersprungen: ${reason}`);
    }
    // Garmin API ist nicht super rate-limit-empfindlich; 200 ms reichen.
    await new Promise((r) => setTimeout(r, 200));
  }

  if (failed.length > 0) {
    console.warn(`\n${failed.length} Tag(e) konnten nicht geholt werden.`);
  }
  return entries;
}
