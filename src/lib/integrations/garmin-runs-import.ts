import { GarminConnect } from "@gooin/garmin-connect";

import { getRunSessionByGarminId, upsertRunSession } from "@/lib/db/queries";
import type { NewRunSession } from "@/lib/db/schema";

// ============================================================
// Garmin-Runs-Import.
// Holt Lauf-Aktivitäten (running / treadmill_running / trail_running etc.)
// und upserts sie in `run_sessions`. Idempotent via garminActivityId.
//
// Garmin's `getActivities(start, limit)` paginiert über alle Aktivitäts-
// Typen gemischt. Wir holen seitenweise und filtern clientseitig auf
// Lauf-typeKeys, bis das älteste Datum vor `since` liegt oder kein Run
// mehr kommt.
// ============================================================

const RUN_TYPE_KEYS = new Set([
  "running",
  "treadmill_running",
  "trail_running",
  "indoor_running",
  "track_running",
  "street_running",
]);

const PAGE_SIZE = 100;

type GarminActivity = {
  activityId: number;
  activityName?: string | null;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
  distance?: number | null;
  duration?: number | null;
  averageHR?: number | null;
  maxHR?: number | null;
  elevationGain?: number | null;
  calories?: number | null;
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  activityTrainingLoad?: number | null;
  vO2MaxValue?: number | null;
};

export type ImportLogEntry = {
  level: "info" | "warn" | "error";
  message: string;
};

export type RunImportResult = {
  scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  log: ImportLogEntry[];
};

export type RunImportOptions = {
  client: GarminConnect;
  // ISO-Date YYYY-MM-DD: untere Grenze (inklusive).
  since?: string;
  // ISO-Date YYYY-MM-DD: obere Grenze (inklusive). Default: heute.
  until?: string;
  // Sicherheitslimit: maximale Anzahl Seiten, die wir paginieren.
  maxPages?: number;
  dryRun?: boolean;
};

export async function syncGarminRuns(
  options: RunImportOptions,
): Promise<RunImportResult> {
  const { client, since, until, maxPages = 50, dryRun = false } = options;
  const log: ImportLogEntry[] = [];
  const result: RunImportResult = {
    scanned: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    log,
  };

  let page = 0;
  let stop = false;

  while (page < maxPages && !stop) {
    const start = page * PAGE_SIZE;
    let batch: GarminActivity[];
    try {
      batch = (await client.getActivities(start, PAGE_SIZE)) as GarminActivity[];
    } catch (err) {
      log.push({
        level: "error",
        message: `Page ${page} (start=${start}): getActivities fehlgeschlagen — ${(err as Error).message}`,
      });
      break;
    }
    if (batch.length === 0) {
      log.push({
        level: "info",
        message: `Page ${page}: leer — Ende der Historie erreicht.`,
      });
      break;
    }

    for (const act of batch) {
      const typeKey = act.activityType?.typeKey;
      if (!typeKey || !RUN_TYPE_KEYS.has(typeKey)) continue;

      const dateIso = (act.startTimeLocal ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        log.push({
          level: "warn",
          message: `Activity ${act.activityId}: ungültiges Datum "${act.startTimeLocal}" — übersprungen.`,
        });
        continue;
      }
      // Wenn wir VOR der unteren Grenze sind, können wir paginieren stoppen —
      // Garmin liefert chronologisch desc.
      if (since && dateIso < since) {
        stop = true;
        break;
      }
      if (until && dateIso > until) {
        result.skipped += 1;
        continue;
      }

      result.scanned += 1;

      const distance = typeof act.distance === "number" ? act.distance : 0;
      const duration = typeof act.duration === "number" ? act.duration : 0;
      if (distance <= 0 || duration <= 0) {
        log.push({
          level: "warn",
          message: `Activity ${act.activityId} (${dateIso}): distance/duration fehlt — übersprungen.`,
        });
        result.skipped += 1;
        continue;
      }

      const km = distance / 1000;
      const avgPace = duration / km;

      const entry: NewRunSession = {
        garminActivityId: act.activityId,
        date: dateIso,
        startTime: act.startTimeLocal ?? `${dateIso}T00:00:00`,
        activityType: typeKey,
        distanceMeters: distance,
        durationSeconds: duration,
        avgPaceSecPerKm: avgPace,
        avgHeartRate: numOrNull(act.averageHR),
        maxHeartRate: numOrNull(act.maxHR),
        elevationGainMeters: numOrNull(act.elevationGain),
        caloriesKcal: numOrNull(act.calories),
        aerobicTrainingEffect: numOrNull(act.aerobicTrainingEffect),
        anaerobicTrainingEffect: numOrNull(act.anaerobicTrainingEffect),
        trainingLoad: numOrNull(act.activityTrainingLoad),
        vo2MaxRun: numOrNull(act.vO2MaxValue),
        rawJson: JSON.stringify(act),
      };

      if (dryRun) {
        log.push({
          level: "info",
          message: `(dry) ${dateIso} ${typeKey} — ${(km).toFixed(2)} km, ${(duration / 60).toFixed(1)} min`,
        });
        result.imported += 1;
        continue;
      }

      const existed = await getRunSessionByGarminId(act.activityId);
      await upsertRunSession(entry);
      if (existed) {
        result.updated += 1;
      } else {
        result.imported += 1;
        log.push({
          level: "info",
          message: `${dateIso} ${typeKey} — ${km.toFixed(2)} km importiert (#${act.activityId}).`,
        });
      }
    }

    page += 1;
  }

  return result;
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
