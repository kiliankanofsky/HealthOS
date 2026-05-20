import type { NextRequest } from "next/server";

import { runAllSyncs } from "@/lib/integrations/sync-all";

// Daily Cron — alle externen Datenquellen in einem Rutsch syncen.
// Vercel ruft GET mit `Authorization: Bearer ${CRON_SECRET}` auf
// (siehe vercel.json crons-Eintrag).
//
// Sync-Logik selbst liegt in src/lib/integrations/sync-all.ts, damit der
// UI-Button (Server Action) denselben Code aufruft.

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
  return Response.json(summary, { status: summary.ok ? 200 : 207 });
}
