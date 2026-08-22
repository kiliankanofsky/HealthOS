import {
  getActiveTrainingPlan,
  getBlocksForPlanSession,
  getDailyActivityForDate,
  getLatestDailyMetrics,
  getNutritionForDate,
  getRunSessionsForDate,
  getSessionsForPlan,
  linkPlanSessionToRun,
  upsertDailyActivity,
  upsertNutritionEntry,
} from "@/lib/db/queries";
import { fddbAdapter } from "@/lib/integrations/fddb";
import { fetchDailyCalories } from "@/lib/integrations/garmin-calories";
import { syncGarminDailyMetrics } from "@/lib/integrations/garmin-metrics";
import { syncGarminRuns } from "@/lib/integrations/garmin-runs-import";
import { getGarminClient } from "@/lib/integrations/garmin-strength";
import { syncGarminStrength } from "@/lib/integrations/garmin-strength-import";
import { refreshNextSessionNote } from "@/lib/endurance/ai-note";
import { getLiveZoneContext } from "@/lib/endurance/live-zones";
import { matchRunToSession } from "@/lib/endurance/run-match";

// Shared sync runner — vom täglichen Cron (/api/cron/sync) UND vom UI-Button
// (Server Action `syncNow`) verwendet, damit beide Wege identisch laufen.
//
// Gewicht ist hier bewusst NICHT dabei: der Google-Sheets-Import lief bis
// 29.06.2026 und ist ausgebaut — Gewichtseinträge und Phasen pflegt der Nutzer
// seitdem direkt in HealthOS (/weight).

export type SyncResult =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error: string };

export type SyncSummary = {
  ok: boolean;
  ranAt: string;
  // Kurze, menschenlesbare Liste „was hat sich verändert" für die UI.
  changes: string[];
  results: {
    garminStrength: SyncResult;
    garminCalories: SyncResult;
    garminRuns: SyncResult;
    garminMetrics: SyncResult;
    // Ordnet absolvierte Läufe automatisch geplanten Sessions zu (läuft nach
    // Runs + Metrics, da es die daraus abgeleiteten Live-Zonen braucht).
    planMatch: SyncResult;
    nutrition: SyncResult;
    // #10: KI-Tagesnotiz für die nächste Session (nutzt die frisch gesyncten
    // Metrics — läuft daher als letzter Schritt).
    nextSessionNote: SyncResult;
  };
};

function todayUtcIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function safe<T extends Record<string, unknown>>(
  fn: () => Promise<T>,
): Promise<SyncResult> {
  try {
    const data = await fn();
    return { ok: true, ...data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function syncStrength(): Promise<Record<string, unknown>> {
  const client = await getGarminClient();
  const result = await syncGarminStrength({ client, fetchLimit: 50, dryRun: false });
  return {
    scanned: result.scanned,
    imported: result.imported,
    skippedAlreadyImported: result.skippedAlreadyImported,
    skippedConflict: result.skippedConflict,
    skippedUnassigned: result.skippedUnassigned,
  };
}

// Garmin-Daily-Summary kann früh am Tag noch partielle Daten liefern
// (z.B. totalKcal=229, bmrKcal=229, activeKcal=0 — der Watch hatte noch
// nicht final gesynct). Wir schreiben für **vergangene** Tage nur, wenn
// die Werte plausibel sind. Für *heute* lassen wir partielle Daten durch,
// weil der Chart heute sowieso ausblendet.
//
// Schwellen: ein erwachsener BMR liegt bei ~1500–2000 kcal/Tag. Wenn das
// Tagestotal darunterliegt, fehlt mit hoher Wahrscheinlichkeit etwas.
const SUSPICIOUS_TOTAL_KCAL = 1500;
const SUSPICIOUS_BMR_KCAL = 1000;

async function syncCalories(): Promise<Record<string, unknown>> {
  const client = await getGarminClient();
  const since = isoDaysAgo(7);
  const entries = await fetchDailyCalories(client, { since });
  const today = todayUtcIso();
  let inserted = 0;
  let updated = 0;
  let skippedPartial = 0;
  for (const entry of entries) {
    const isPast = entry.date < today;
    const looksPartial =
      entry.totalKcal < SUSPICIOUS_TOTAL_KCAL ||
      (entry.bmrKcal != null && entry.bmrKcal < SUSPICIOUS_BMR_KCAL);
    if (isPast && looksPartial) {
      skippedPartial++;
      continue;
    }
    const existing = await getDailyActivityForDate(entry.date, "garmin");
    await upsertDailyActivity(entry);
    if (existing) updated++;
    else inserted++;
  }
  return { days: entries.length, inserted, updated, skippedPartial };
}

async function syncRuns(): Promise<Record<string, unknown>> {
  const client = await getGarminClient();
  const result = await syncGarminRuns({
    client,
    since: isoDaysAgo(7),
    maxPages: 3,
  });
  return {
    scanned: result.scanned,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
  };
}

async function syncMetrics(): Promise<Record<string, unknown>> {
  const client = await getGarminClient();
  // Laktatschwelle vor dem Sync merken, um eine Änderung erkennen zu können.
  const ltBefore = await getLatestDailyMetrics();
  const ltPaceBefore = ltBefore?.lactateThresholdPaceSecPerKm ?? null;
  const ltHrBefore = ltBefore?.lactateThresholdHr ?? null;
  // Heute + die letzten zwei Tage (manchmal kommen Sleep-/HRV-Werte verzögert).
  const dates = [isoDaysAgo(2), isoDaysAgo(1), todayUtcIso()];
  const result = await syncGarminDailyMetrics({ client, dates });
  const ltAfter = await getLatestDailyMetrics();
  const ltPaceAfter = ltAfter?.lactateThresholdPaceSecPerKm ?? null;
  const ltHrAfter = ltAfter?.lactateThresholdHr ?? null;
  // Pace auf ganze Sekunden gerundet vergleichen (Rauschen ausblenden).
  const round = (v: number | null) => (v == null ? null : Math.round(v));
  const ltChanged =
    (ltPaceBefore != null || ltPaceAfter != null) &&
    (round(ltPaceBefore) !== round(ltPaceAfter) || ltHrBefore !== ltHrAfter);
  return {
    daysProcessed: result.daysProcessed,
    ltChanged,
    ltHrBefore,
    ltHrAfter,
    ltPaceBefore,
    ltPaceAfter,
  };
}

async function syncNextSessionNote(): Promise<Record<string, unknown>> {
  const r = await refreshNextSessionNote();
  return { generated: r.generated };
}

async function syncNutrition(): Promise<Record<string, unknown>> {
  const since = isoDaysAgo(7);
  const entries = await fddbAdapter.fetchNutritionEntries({ since });
  let inserted = 0;
  let updated = 0;
  for (const entry of entries) {
    const existing = await getNutritionForDate(entry.date, "fddb");
    await upsertNutritionEntry(entry);
    if (existing) updated++;
    else inserted++;
  }
  return { days: entries.length, inserted, updated };
}

// Ordnet frisch gesyncte Läufe automatisch geplanten Sessions zu (Status →
// "completed"), wenn Distanz/Struktur/Intensität passen. Idempotent: bereits
// verlinkte Sessions/Läufe werden übersprungen. Nutzt die Live-Trainingszonen
// (gleiche Quelle wie die Plan-Paces).
export async function matchRunsToPlanSessions(): Promise<Record<string, unknown>> {
  const plan = await getActiveTrainingPlan();
  if (!plan) return { matched: 0, skipped: "kein aktiver Plan" };

  const today = todayUtcIso();
  const since = isoDaysAgo(14);
  const live = await getLiveZoneContext();
  const paceZones = live.paceZones ?? plan.paceZonesJson ?? null;
  const hrZones = live.hrZones;

  const sessions = await getSessionsForPlan(plan.id);
  // Läufe, die schon einer Session zugeordnet sind, nicht doppelt vergeben.
  const usedRunIds = new Set<number>();
  for (const s of sessions) {
    if (s.runSessionId != null) usedRunIds.add(s.runSessionId);
  }

  let matched = 0;
  const log: string[] = [];
  for (const s of sessions) {
    if (s.status !== "planned" || s.runSessionId != null) continue;
    if (s.date < since || s.date > today) continue;

    const runs = await getRunSessionsForDate(s.date);
    const candidates = runs.filter((r) => !usedRunIds.has(r.id));
    if (candidates.length === 0) continue;

    const blocks = (await getBlocksForPlanSession(s.id)).map((b) => ({
      repetitions: b.repetitions,
      segmentsJson: b.segmentsJson,
    }));

    for (const run of candidates) {
      const res = matchRunToSession({ session: s, blocks, run, paceZones, hrZones });
      if (res.matched) {
        await linkPlanSessionToRun(s.id, run.id);
        usedRunIds.add(run.id);
        matched++;
        log.push(`${s.date} ${s.sessionType} ← #${run.id}: ${res.reason}`);
        break;
      }
    }
  }
  return { matched, log };
}

export async function runAllSyncs(): Promise<SyncSummary> {
  const ranAt = new Date().toISOString();
  const results = {
    garminStrength: await safe(syncStrength),
    garminCalories: await safe(syncCalories),
    garminRuns: await safe(syncRuns),
    garminMetrics: await safe(syncMetrics),
    // Nach Runs+Metrics: absolvierte Läufe geplanten Sessions zuordnen.
    planMatch: await safe(matchRunsToPlanSessions),
    nutrition: await safe(syncNutrition),
    // Zuletzt: Tagesnotiz aus den frisch gesyncten Erholungsdaten ableiten.
    nextSessionNote: await safe(syncNextSessionNote),
  };
  const ok = Object.values(results).every((r) => r.ok);
  return { ok, ranAt, changes: buildChanges(results), results };
}

// Liest die (typlosen) Zahlen-Felder eines erfolgreichen SyncResult.
function num(r: SyncResult, key: string): number {
  if (!r.ok) return 0;
  const v = (r as Record<string, unknown>)[key];
  return typeof v === "number" ? v : 0;
}
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// Baut aus den Sync-Ergebnissen eine kurze, prägnante Änderungs-Liste — das
// Feld unter dem Sync-Button. Wenn nichts Nennenswertes passiert: ein Hinweis.
function buildChanges(results: SyncSummary["results"]): string[] {
  const out: string[] = [];

  const strengthNew = num(results.garminStrength, "imported");
  if (strengthNew > 0)
    out.push(`${plural(strengthNew, "Krafteinheit", "Krafteinheiten")} importiert`);

  const runsNew = num(results.garminRuns, "imported");
  const runsUpd = num(results.garminRuns, "updated");
  if (runsNew > 0) out.push(`${plural(runsNew, "Lauf", "Läufe")} importiert`);
  if (runsUpd > 0) out.push(`${plural(runsUpd, "Lauf", "Läufe")} aktualisiert`);

  const metricDays = num(results.garminMetrics, "daysProcessed");
  if (metricDays > 0)
    out.push(`Erholungsdaten für ${plural(metricDays, "Tag", "Tage")} aktualisiert`);

  // Laktatschwelle: explizite Änderung melden (mit Pace, falls vorhanden).
  if (results.garminMetrics.ok && (results.garminMetrics as Record<string, unknown>).ltChanged) {
    const before = (results.garminMetrics as Record<string, unknown>).ltPaceBefore;
    const after = (results.garminMetrics as Record<string, unknown>).ltPaceAfter;
    const fmt = (v: unknown) =>
      typeof v === "number"
        ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}/km`
        : "—";
    out.push(
      typeof after === "number"
        ? `Laktatschwelle angepasst (${fmt(before)} → ${fmt(after)})`
        : "Laktatschwelle hat sich angepasst",
    );
  }

  const matched = num(results.planMatch, "matched");
  if (matched > 0)
    out.push(`${plural(matched, "Lauf", "Läufe")} einer Plan-Session zugeordnet`);

  const nutNew = num(results.nutrition, "inserted");
  const nutUpd = num(results.nutrition, "updated");
  if (nutNew > 0 || nutUpd > 0) {
    const parts: string[] = [];
    if (nutNew > 0) parts.push(`${nutNew} neu`);
    if (nutUpd > 0) parts.push(`${nutUpd} aktualisiert`);
    out.push(`Ernährung: ${parts.join(", ")}`);
  }

  // Zonen werden live aus Läufen + LT abgeleitet → bei neuen Läufen/LT-Änderung
  // hat sich auch die Zeit-in-Zonen dieser Woche verschoben.
  const ltChanged =
    results.garminMetrics.ok &&
    Boolean((results.garminMetrics as Record<string, unknown>).ltChanged);
  if (runsNew > 0 || runsUpd > 0 || ltChanged)
    out.push("Trainingszonen & Zeit in Zonen neu berechnet");

  if (num(results.nextSessionNote, "generated") > 0)
    out.push("KI-Tagesnotiz neu erstellt");

  if (out.length === 0) out.push("Keine neuen Daten — alles ist aktuell.");
  return out;
}
