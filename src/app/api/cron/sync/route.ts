import type { NextRequest } from "next/server";

import {
  getDailyActivityForDate,
  getNutritionForDate,
  upsertDailyActivity,
  upsertNutritionEntry,
} from "@/lib/db/queries";
import { fddbAdapter } from "@/lib/integrations/fddb";
import { fetchDailyCalories } from "@/lib/integrations/garmin-calories";
import { getGarminClient } from "@/lib/integrations/garmin-strength";
import { syncGarminStrength } from "@/lib/integrations/garmin-strength-import";
import { sheetsAdapter } from "@/lib/integrations/sheets";

// Daily Cron — alle externen Datenquellen in einem Rutsch syncen.
// Vercel ruft GET mit `Authorization: Bearer ${CRON_SECRET}` auf
// (siehe vercel.json crons-Eintrag).
//
// Layout der Response:
// {
//   ok: true | false,
//   ranAt: ISO,
//   results: { sheets, garminStrength, garminCalories, nutrition }
// }
// — jedes Sub-Result ist entweder { ok: true, ... } oder { ok: false, error: string }.
// Ein Fehler in einem Sync stoppt den nächsten NICHT, damit ein temporärer
// Ausfall (z.B. fddb-Cookie abgelaufen) den Rest nicht mitnimmt.

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type SyncResult = { ok: true; [k: string]: unknown } | { ok: false; error: string };

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

async function syncCalories(): Promise<Record<string, unknown>> {
  const client = await getGarminClient();
  const since = isoDaysAgo(7);
  const entries = await fetchDailyCalories(client, { since });
  let inserted = 0;
  let updated = 0;
  for (const entry of entries) {
    const existing = await getDailyActivityForDate(entry.date, "garmin");
    await upsertDailyActivity(entry);
    if (existing) updated++;
    else inserted++;
  }
  return { days: entries.length, inserted, updated };
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

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, error: "CRON_SECRET nicht konfiguriert" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ranAt = new Date().toISOString();
  const results = {
    sheets: await safe(syncSheets),
    garminStrength: await safe(syncStrength),
    garminCalories: await safe(syncCalories),
    nutrition: await safe(syncNutrition),
  };
  const ok = Object.values(results).every((r) => r.ok);
  return Response.json({ ok, ranAt, results }, { status: ok ? 200 : 207 });
}
