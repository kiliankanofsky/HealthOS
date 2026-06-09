// DB-Persistierung der KI-Generierungs-Ergebnisse.
//
// Wird sowohl von der Server-Action (generatePlanSessions in
// /endurance/recommendations/actions.ts) als auch vom CLI-Skript
// (scripts/generate-plan.ts) genutzt — daher in eigener Datei.
//
// Trennt sich vom reinen Claude-Call-Layer (ai-generator.ts) und vom
// Next.js-spezifischen Action-Wrapping (actions.ts).

import { insertPlanBlocks, insertPlanSessions } from "@/lib/db/queries";
import type {
  NewTrainingPlanBlock,
  NewTrainingPlanSession,
  TrainingPlanWeek,
} from "@/lib/db/schema";
import type {
  AiChunkOutput,
  AiSession,
  AiSessionAlternative,
} from "@/lib/endurance/ai-schema";

export type PersistResult = {
  primarySessions: number;
  alternativeSessions: number;
  // Wenn nicht ok: erste Fehler-Beschreibung (z.B. ungültige Wochennummer).
  ok: boolean;
  error?: string;
};

// dayOfWeek (1=Mo..7=So) → ISO-Datum innerhalb der Plan-Woche.
// Defensiv: dayOfWeek wird auf [1..7] geclamped, falls die KI etwas
// abweichendes liefert (z.B. 0).
function dateForDayOfWeek(weekStartIso: string, dayOfWeek: number): string {
  const safeDow = Math.max(1, Math.min(7, Math.round(dayOfWeek)));
  // UTC-sicher rechnen: `new Date("YYYY-MM-DDT00:00:00")` ist LOKALZEIT, und
  // `.toISOString()` konvertiert nach UTC → in Zeitzonen mit positivem Offset
  // (z.B. CEST +2) rutscht das Datum auf den Vortag. Daher über Date.UTC.
  const [y, m, d] = weekStartIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (safeDow - 1));
  return dt.toISOString().slice(0, 10);
}

function aiSessionToRow(
  src: AiSession | AiSessionAlternative,
  ctx: {
    planId: number;
    weekId: number;
    date: string;
    dayOrder: number;
    alternativeOfId: number | null;
  },
): NewTrainingPlanSession {
  return {
    planId: ctx.planId,
    weekId: ctx.weekId,
    date: ctx.date,
    dayOrder: ctx.dayOrder,
    sessionType: src.sessionType,
    title: src.title,
    description: src.description ?? null,
    targetDurationSec: src.targetDurationSec ?? null,
    targetDistanceMeters: src.targetDistanceMeters ?? null,
    primaryZone: src.primaryZone ?? null,
    status: "planned",
    aiLocked: false,
    alternativeOfId: ctx.alternativeOfId,
    selectedAlternativeId: null,
    runSessionId: null,
  };
}

// Schreibt eine Chunk-Antwort der KI in die DB.
// `allWeeks` = ALLE Wochen des Plans (nicht nur die des Chunks), damit
// weekNumber → weekId Mapping auch wenn KI über die Chunk-Grenzen blickt.
export async function persistChunkOutput(args: {
  planId: number;
  allWeeks: TrainingPlanWeek[];
  output: AiChunkOutput;
}): Promise<PersistResult> {
  const { planId, allWeeks, output } = args;

  // ---- Primary Sessions sammeln (Bulk-Insert) ----
  const primaryRows: NewTrainingPlanSession[] = [];
  type PendingMap = { aiSession: AiSession; weekId: number };
  const pending: PendingMap[] = [];

  for (const aiWeek of output.weeks) {
    const dbWeek = allWeeks.find((w) => w.weekNumber === aiWeek.weekNumber);
    if (!dbWeek) {
      return {
        ok: false,
        primarySessions: 0,
        alternativeSessions: 0,
        error: `KI hat ungültige Wochennummer ${aiWeek.weekNumber} zurückgegeben.`,
      };
    }
    for (const aiSession of aiWeek.sessions) {
      primaryRows.push(
        aiSessionToRow(aiSession, {
          planId,
          weekId: dbWeek.id,
          date: dateForDayOfWeek(dbWeek.startDate, aiSession.dayOfWeek),
          dayOrder: aiSession.dayOrder ?? 1,
          alternativeOfId: null,
        }),
      );
      pending.push({ aiSession, weekId: dbWeek.id });
    }
  }

  const insertedPrimary = await insertPlanSessions(primaryRows);

  // ---- Primary-Blocks (Bulk) ----
  const primaryBlocks: NewTrainingPlanBlock[] = [];
  for (let i = 0; i < insertedPrimary.length; i++) {
    const sessionId = insertedPrimary[i].id;
    const aiSession = pending[i].aiSession;
    for (const block of aiSession.blocks) {
      primaryBlocks.push({
        sessionId,
        blockOrder: block.blockOrder,
        repetitions: block.repetitions,
        segmentsJson: block.segments,
        description: block.description ?? null,
      });
    }
  }
  await insertPlanBlocks(primaryBlocks);

  // ---- Alternativen + ihre Blocks ----
  const altRows: NewTrainingPlanSession[] = [];
  type AltPending = { altSpec: AiSessionAlternative };
  const altPending: AltPending[] = [];

  for (let i = 0; i < insertedPrimary.length; i++) {
    const primary = insertedPrimary[i];
    const aiSession = pending[i].aiSession;
    if (!aiSession.alternative) continue;
    altRows.push(
      aiSessionToRow(aiSession.alternative, {
        planId,
        weekId: pending[i].weekId,
        date: primary.date,
        dayOrder: primary.dayOrder,
        alternativeOfId: primary.id,
      }),
    );
    altPending.push({ altSpec: aiSession.alternative });
  }

  let alternativeCount = 0;
  if (altRows.length > 0) {
    const insertedAlt = await insertPlanSessions(altRows);
    alternativeCount = insertedAlt.length;
    const altBlocks: NewTrainingPlanBlock[] = [];
    for (let i = 0; i < insertedAlt.length; i++) {
      const sessionId = insertedAlt[i].id;
      const altSpec = altPending[i].altSpec;
      for (const block of altSpec.blocks) {
        altBlocks.push({
          sessionId,
          blockOrder: block.blockOrder,
          repetitions: block.repetitions,
          segmentsJson: block.segments,
          description: block.description ?? null,
        });
      }
    }
    await insertPlanBlocks(altBlocks);
  }

  return {
    ok: true,
    primarySessions: insertedPrimary.length,
    alternativeSessions: alternativeCount,
  };
}
