// ============================================================
// Live-Trainingszonen als EINE Quelle.
//
// Die Trainingszonen-Card auf /endurance leitet Pace + HF pro Zone aus den
// echten Lauf-Daten ab (zone-estimation.ts). Genau diese Werte sollen auch
// die Paces/HF im Trainingsplan (/endurance/recommendations + Dashboard) und
// das Run-Matching (run-match.ts) speisen — statt der starren paceZonesJson
// aus dem Plan-Setup.
//
// Dieser Helper bündelt die Berechnung, die endurance/page.tsx bisher inline
// gemacht hat, sodass alle Konsumenten denselben Datensatz sehen. Server-only
// (greift auf die DB zu).
// ============================================================

import {
  getAllRunSessions,
  getDailyMetricsBetween,
  getLatestDailyMetrics,
} from "@/lib/db/queries";
import type { GarminDailyMetrics, RunSession } from "@/lib/db/schema";
import type { HrZones, PaceZones } from "@/lib/endurance/plan";
import {
  buildZoneRows,
  estimateZonesFromRuns,
  type ZoneEstimation,
  type ZoneRow,
} from "@/lib/endurance/zone-estimation";

const MARATHON_DISTANCE_KM = 42.195;

export type LiveZoneContext = {
  estimation: ZoneEstimation;
  zoneRows: ZoneRow[] | null;
  /** Schwellen-HF (LTHR), aus Garmin abgeleitet — Default der Card. */
  lthr: number | null;
  /** Garmin-Marathon-Prognose ÷ 42,195 (sec/km) — Default-Z3-Anker. */
  defaultMarathonPredPace: number | null;
  /** Pace-Bänder pro Zone — null, wenn die Datenlage nicht für alle 5 reicht. */
  paceZones: PaceZones | null;
  /** HF-Bänder pro Zone — null ohne LTHR. */
  hrZones: HrZones | null;
};

// ZoneRow[] → PaceZones. paceFast = schnelles Ende (minSec), paceSlow =
// langsames Ende (maxSec). Liefert null, wenn nicht alle 5 Zonen eine
// vollständige Pace-Spanne haben (dann fällt der Aufrufer auf die statischen
// Plan-Zonen zurück).
export function paceZonesFromRows(rows: ZoneRow[] | null): PaceZones | null {
  if (!rows) return null;
  const byZone = new Map(rows.map((r) => [r.zone.zone, r]));
  const out = {} as PaceZones;
  for (let n = 1; n <= 5; n++) {
    const row = byZone.get(`Z${n}` as ZoneRow["zone"]["zone"]);
    if (!row || row.paceFast == null || row.paceSlow == null) return null;
    out[`z${n}` as keyof PaceZones] = {
      minSec: row.paceFast,
      maxSec: row.paceSlow,
    };
  }
  return out;
}

// ZoneRow[] → HrZones. hrLow/hrHigh dürfen offen (null) sein (Z1 unten, Z5
// oben). Liefert null, wenn keine LTHR vorlag (dann sind ALLE HF-Grenzen null).
export function hrZonesFromRows(rows: ZoneRow[] | null): HrZones | null {
  if (!rows) return null;
  const byZone = new Map(rows.map((r) => [r.zone.zone, r]));
  const out = {} as HrZones;
  for (let n = 1; n <= 5; n++) {
    const row = byZone.get(`Z${n}` as ZoneRow["zone"]["zone"]);
    out[`z${n}` as keyof HrZones] = {
      minBpm: row?.hrLow ?? null,
      maxBpm: row?.hrHigh ?? null,
    };
  }
  // Z2 ist immer beidseitig begrenzt, sobald eine LTHR vorliegt — fehlt sie,
  // gibt es keine sinnvollen HF-Bänder.
  if (out.z2.minBpm == null && out.z2.maxBpm == null) return null;
  return out;
}

// Alle Eingaben optional vorab ladbar (Aufrufer wie endurance/page.tsx haben
// runs/Metrics schon) — spart Doppel-Queries. Sonst wird selbst geladen.
export async function getLiveZoneContext(
  opts: {
    runs?: RunSession[];
    latestMetrics?: GarminDailyMetrics;
    metricsHistory?: GarminDailyMetrics[];
  } = {},
): Promise<LiveZoneContext> {
  const today = new Date();
  const toIso = today.toISOString().slice(0, 10);

  const runs = opts.runs ?? (await getAllRunSessions());

  const latestMetrics = opts.latestMetrics ?? (await getLatestDailyMetrics());
  const metricsHistoryFrom = new Date(today);
  metricsHistoryFrom.setDate(today.getDate() - 56);
  const metricsHistory =
    opts.metricsHistory ??
    (await getDailyMetricsBetween(
      metricsHistoryFrom.toISOString().slice(0, 10),
      toIso,
    ));
  const newestFirst = [...metricsHistory].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const defaultLtPace =
    latestMetrics?.lactateThresholdPaceSecPerKm ??
    newestFirst.find((m) => m.lactateThresholdPaceSecPerKm != null)
      ?.lactateThresholdPaceSecPerKm ??
    null;
  const lthr =
    latestMetrics?.lactateThresholdHr ??
    newestFirst.find((m) => m.lactateThresholdHr != null)?.lactateThresholdHr ??
    null;
  const marathonPredSec =
    latestMetrics?.racePredictionMarathon ??
    newestFirst.find((m) => m.racePredictionMarathon != null)
      ?.racePredictionMarathon ??
    null;
  const defaultMarathonPredPace =
    marathonPredSec != null ? Math.round(marathonPredSec / MARATHON_DISTANCE_KM) : null;

  const estimationFrom = new Date(today);
  estimationFrom.setDate(today.getDate() - 180);
  const estimationFromIso = estimationFrom.toISOString().slice(0, 10);
  const estimation = estimateZonesFromRuns(
    runs.filter((r) => r.date >= estimationFromIso),
    estimationFromIso,
    toIso,
    { garminLtPaceSecPerKm: defaultLtPace, lthr, marathonPredSec },
  );

  // Server-Default = ohne Ziel-MP-Override (entspricht der Card mit leerem Feld).
  const zoneRows = lthr != null ? buildZoneRows(estimation, lthr, {}) : null;

  return {
    estimation,
    zoneRows,
    lthr,
    defaultMarathonPredPace,
    paceZones: paceZonesFromRows(zoneRows),
    hrZones: hrZonesFromRows(zoneRows),
  };
}
