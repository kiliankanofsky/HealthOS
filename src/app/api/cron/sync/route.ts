import type { NextRequest } from "next/server";

import { ensureDailyOverview } from "@/lib/dashboard/overview";
import { runAllSyncs } from "@/lib/integrations/sync-all";
import { todayBerlinISO } from "@/lib/utils/date";

// Daily Cron — alle externen Datenquellen in einem Rutsch syncen.
// Vercel ruft GET mit `Authorization: Bearer ${CRON_SECRET}` auf
// (siehe vercel.json crons-Eintrag).
//
// Sync-Logik selbst liegt in src/lib/integrations/sync-all.ts, damit der
// UI-Button (Server Action) denselben Code aufruft.
//
// Nach den Syncs wird zusätzlich die KI-Tagesübersicht fürs Dashboard
// generiert — BEST EFFORT: Vercel-Hobby erlaubt nur 2 Crons (beide belegt)
// und 60s Laufzeit. Schlägt die Generierung fehl oder reißt das Zeitlimit,
// holt die Startseite sie beim nächsten Aufruf selbst nach (Self-Heal in
// DailyOverviewCard). ensureDailyOverview ist idempotent — der zweite
// Cron-Lauf des Tages generiert nicht doppelt.

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  const summary = await runAllSyncs();

  let overview: { ok: boolean; error?: string };
  try {
    await ensureDailyOverview(todayBerlinISO());
    overview = { ok: true };
  } catch (e) {
    overview = { ok: false, error: (e as Error).message };
  }

  return Response.json(
    { ...summary, overview },
    { status: summary.ok ? 200 : 207 },
  );
}
