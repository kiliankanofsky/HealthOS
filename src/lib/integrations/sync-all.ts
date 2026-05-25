import {
  getDailyActivityForDate,
  getNutritionForDate,
  upsertDailyActivity,
  upsertNutritionEntry,
} from "@/lib/db/queries";
import { fddbAdapter } from "@/lib/integrations/fddb";
import { fetchDailyCalories } from "@/lib/integrations/garmin-calories";
import { syncGarminDailyMetrics } from "@/lib/integrations/garmin-metrics";
import { syncGarminRuns } from "@/lib/integrations/garmin-runs-import";
import { getGarminClient } from "@/lib/integrations/garmin-strength";
import { syncGarminStrength } from "@/lib/integrations/garmin-strength-import";
import { sheetsAdapter } from "@/lib/integrations/sheets";

// Shared sync runner — vom täglichen Cron (/api/cron/sync) UND vom UI-Button
// (Server Action `syncNow`) verwendet, damit beide Wege identisch laufen.

export type SyncResult =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error: string };

export type SyncSummary = {
  ok: boolean;
  ranAt: string;
  results: {
    sheets: SyncResult;
    garminStrength: SyncResult;
    garminCalories: SyncResult;
    garminRuns: SyncResult;
    garminMetrics: SyncResult;
    nutrition: SyncResult;
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

async function syncSheets(): Promise<Record<string, unknown>> {
  const result = await sheetsAdapter.sync();
  return { inserted: result.inserted };
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
  // Heute + die letzten zwei Tage (manchmal kommen Sleep-/HRV-Werte verzögert).
  const dates = [isoDaysAgo(2), isoDaysAgo(1), todayUtcIso()];
  const result = await syncGarminDailyMetrics({ client, dates });
  return { daysProcessed: result.daysProcessed };
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

export async function runAllSyncs(): Promise<SyncSummary> {
  const ranAt = new Date().toISOString();
  const results = {
    sheets: await safe(syncSheets),
    garminStrength: await safe(syncStrength),
    garminCalories: await safe(syncCalories),
    garminRuns: await safe(syncRuns),
    garminMetrics: await safe(syncMetrics),
    nutrition: await safe(syncNutrition),
  };
  const ok = Object.values(results).every((r) => r.ok);
  return { ok, ranAt, results };
}
