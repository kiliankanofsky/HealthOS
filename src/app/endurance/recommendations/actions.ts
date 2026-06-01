"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createTrainingPlan,
  getSessionsForPlan,
  getTrainingPlanById,
  getActiveTrainingPlan,
  getWeeksForPlan,
  insertPlanBlocks,
  insertPlanSessions,
  insertPlanWeeks,
  setTrainingPlanStatus,
  updateTrainingPlan,
} from "@/lib/db/queries";
import type {
  NewTrainingPlanBlock,
  NewTrainingPlanSession,
} from "@/lib/db/schema";
import {
  type AiModel,
  chunkWeeks,
  generateChunk,
} from "@/lib/endurance/ai-generator";
import type {
  AiSession,
  AiSessionAlternative,
} from "@/lib/endurance/ai-schema";
import {
  computePlanWeeks,
  derivePaceZones,
  parseHmsToSeconds,
  type PaceZones,
} from "@/lib/endurance/plan";
import { extractPdfText } from "@/lib/endurance/pdf-extract";

// Hinweis zum Vercel-Timeout: dieser "use server"-File darf nur async
// Funktionen exportieren — daher lebt `export const maxDuration = 60` auf
// /endurance/recommendations/page.tsx (Page-Level erbt auf die Action).

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// Cap, damit kein riesiges PDF die DB sprengt. ~500k Zeichen ≈ 100+ Seiten Text,
// genug für Marathon-Pläne mit Begleittext. Bei Überschreitung wird die
// Action mit Fehler abgelehnt (statt silent zu truncaten) — Nutzer muss das
// PDF kürzen oder nur den relevanten Teil hochladen.
const PDF_TEXT_MAX_CHARS = 500_000;

export type CreatePlanState = {
  ok: boolean;
  error?: string;
};

function num(value: FormDataEntryValue | null): number | undefined {
  if (value === null) return undefined;
  const str = String(value).replace(",", ".").trim();
  if (str === "") return undefined;
  const n = Number(str);
  return Number.isFinite(n) ? n : undefined;
}

// Liest die fünf Pace-Zonen aus dem Form (jede Zone hat min/max). Liefert
// undefined, wenn nichts gesetzt ist — dann wird auto-derived.
function readPaceZonesFromForm(formData: FormData): PaceZones | undefined {
  const get = (key: string) => num(formData.get(key));
  const zones = {
    z1: { minSec: get("z1Min"), maxSec: get("z1Max") },
    z2: { minSec: get("z2Min"), maxSec: get("z2Max") },
    z3: { minSec: get("z3Min"), maxSec: get("z3Max") },
    z4: { minSec: get("z4Min"), maxSec: get("z4Max") },
    z5: { minSec: get("z5Min"), maxSec: get("z5Max") },
  };
  const allSet = Object.values(zones).every(
    (z) => z.minSec !== undefined && z.maxSec !== undefined,
  );
  if (!allSet) return undefined;
  return zones as PaceZones;
}

export async function createPlanFromSettings(
  _prev: CreatePlanState | undefined,
  formData: FormData,
): Promise<CreatePlanState> {
  // ---- Validate ----
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) return { ok: false, error: "Plan-Name fehlt." };

  const raceName = String(formData.get("raceName") ?? "").trim() || null;
  const raceDate = String(formData.get("raceDate") ?? "").trim();
  if (!DATE_REGEX.test(raceDate)) {
    return { ok: false, error: "Race-Datum muss YYYY-MM-DD sein." };
  }

  const raceDistanceKm = num(formData.get("raceDistanceKm"));
  if (raceDistanceKm === undefined || raceDistanceKm <= 0) {
    return { ok: false, error: "Race-Distanz fehlt oder ungültig." };
  }

  const targetTimeRaw = String(formData.get("targetTime") ?? "").trim();
  let targetTimeSeconds: number;
  try {
    targetTimeSeconds = parseHmsToSeconds(targetTimeRaw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (targetTimeSeconds <= 0) {
    return { ok: false, error: "Zielzeit muss > 0 sein." };
  }

  const targetPaceSecPerKm = targetTimeSeconds / raceDistanceKm;

  const targetWeeklyKmPeak = num(formData.get("targetWeeklyKmPeak")) ?? null;
  const sessionsPerWeek = num(formData.get("sessionsPerWeek")) ?? null;

  const totalWeeks = num(formData.get("totalWeeks"));
  if (totalWeeks === undefined || totalWeeks < 1 || totalWeeks > 52) {
    return { ok: false, error: "Anzahl Wochen muss zwischen 1 und 52 liegen." };
  }
  const totalWeeksInt = Math.round(totalWeeks);

  // Pace-Zonen: aus Form lesen, sonst auto-derived.
  const paceZones = readPaceZonesFromForm(formData) ?? derivePaceZones(targetPaceSecPerKm);

  // Sanity-Check: pro Zone muss minSec ≤ maxSec sein. Auto-derived ist immer
  // korrekt; nur bei manuell überschriebenen Werten kann das schiefgehen.
  const zoneLabels = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;
  for (let i = 0; i < zoneLabels.length; i++) {
    const key = `z${i + 1}` as keyof PaceZones;
    const z = paceZones[key];
    if (z.minSec > z.maxSec) {
      return {
        ok: false,
        error: `${zoneLabels[i]}: schnellere Pace (Min) muss ≤ langsamere Pace (Max) sein.`,
      };
    }
  }

  // ---- Wochen vorab berechnen (Race-Datum rückwärts) ----
  let computed: ReturnType<typeof computePlanWeeks>;
  try {
    computed = computePlanWeeks(raceDate, totalWeeksInt);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // ---- PDF-Text extrahieren (optional) ----
  const pdfFile = formData.get("pdf");
  let referencePdfText: string | null = null;
  let referencePdfName: string | null = null;
  if (pdfFile instanceof File && pdfFile.size > 0) {
    try {
      const text = await extractPdfText(pdfFile);
      if (text.length > PDF_TEXT_MAX_CHARS) {
        // Hartes Reject statt silent truncate — sonst weiß die KI in S3 nicht,
        // dass ihr Kontext beschnitten wurde.
        return {
          ok: false,
          error: `PDF-Text ist ${text.length.toLocaleString("de-DE")} Zeichen — Limit ist ${PDF_TEXT_MAX_CHARS.toLocaleString("de-DE")}. Bitte kürze das PDF oder lade nur den relevanten Teil hoch.`,
        };
      }
      referencePdfText = text;
      referencePdfName = pdfFile.name;
    } catch (e) {
      return { ok: false, error: `PDF konnte nicht gelesen werden: ${(e as Error).message}` };
    }
  }

  // ---- Bestehenden aktiven Plan ggf. archivieren ----
  const existingActive = await getActiveTrainingPlan();
  if (existingActive) {
    await setTrainingPlanStatus(existingActive.id, "archived");
  }

  // ---- Plan + Wochen in DB schreiben ----
  const plan = await createTrainingPlan({
    name,
    goalType: "race",
    raceName,
    raceDate,
    raceDistanceKm,
    targetTimeSeconds,
    targetPaceSecPerKm,
    targetWeeklyKmPeak,
    sessionsPerWeek,
    planStartDate: computed.planStartDate,
    totalWeeks: totalWeeksInt,
    status: "draft",
    paceZonesJson: paceZones,
    referencePdfText,
    referencePdfName,
  });

  await insertPlanWeeks(
    computed.weeks.map((w) => ({
      planId: plan.id,
      weekNumber: w.weekNumber,
      startDate: w.startDate,
      endDate: w.endDate,
      phase: w.phase,
    })),
  );

  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");
  redirect("/endurance/recommendations");
}

// ============================================================
// KI-Plan-Generierung (Sprint 3)
// ============================================================

export type GeneratePlanState = {
  ok: boolean;
  error?: string;
  generated?: {
    sessions: number;
    alternatives: number;
    chunks: number;
    totalCacheReadTokens: number;
  };
};

// Hilfsfunktion: AiSession (oder AiSessionAlternative) → NewTrainingPlanSession.
// `weekId` und `date` müssen vom Aufrufer aufgelöst werden.
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

// dayOfWeek (1=Mo..7=So) → ISO-Datum innerhalb der Plan-Woche.
function dateForDayOfWeek(weekStartIso: string, dayOfWeek: number): string {
  // dayOfWeek 1=Mo → Offset 0; 7=So → Offset 6.
  const monday = new Date(`${weekStartIso}T00:00:00`);
  monday.setDate(monday.getDate() + (dayOfWeek - 1));
  return monday.toISOString().slice(0, 10);
}

export async function generatePlanSessions(
  planId: number,
  options: { model?: AiModel } = {},
): Promise<GeneratePlanState> {
  const plan = await getTrainingPlanById(planId);
  if (!plan) return { ok: false, error: "Plan nicht gefunden." };
  if (plan.status !== "draft") {
    return {
      ok: false,
      error: `Plan-Status ist "${plan.status}". KI-Generierung läuft nur auf draft.`,
    };
  }

  const existing = await getSessionsForPlan(planId);
  if (existing.length > 0) {
    return {
      ok: false,
      error: `Plan hat bereits ${existing.length} Sessions. Erst löschen oder neuen Plan anlegen.`,
    };
  }

  const weeks = await getWeeksForPlan(planId);
  if (weeks.length === 0) {
    return { ok: false, error: "Plan hat keine Wochen — Setup nicht abgeschlossen." };
  }

  const model = options.model ?? "sonnet";
  const chunks = chunkWeeks(weeks);

  let totalSessions = 0;
  let totalAlternatives = 0;
  let totalCacheRead = 0;

  // Pro Chunk: KI-Call → DB-Inserts. Sequenziell, damit Prompt-Caching greift
  // (zweiter und folgende Calls lesen den PDF-Block aus dem Cache).
  for (const chunk of chunks) {
    let result;
    try {
      result = await generateChunk(plan, chunk, model);
    } catch (e) {
      return {
        ok: false,
        error: `KI-Call fehlgeschlagen (Chunk Wochen ${chunk[0].weekNumber}-${chunk[chunk.length - 1].weekNumber}): ${(e as Error).message}`,
      };
    }
    totalCacheRead += result.usage.cacheReadInputTokens;

    // ---- Primary Sessions sammeln (Bulk-Insert) ----
    const primaryRows: NewTrainingPlanSession[] = [];
    // Index = Position in primaryRows, Value = { aiSession, weekId } für Block-Mapping nach Insert.
    type PendingMap = {
      aiSession: AiSession;
      weekId: number;
    };
    const pending: PendingMap[] = [];

    for (const aiWeek of result.output.weeks) {
      const dbWeek = weeks.find((w) => w.weekNumber === aiWeek.weekNumber);
      if (!dbWeek) {
        return {
          ok: false,
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
    totalSessions += insertedPrimary.length;

    // ---- Primary-Blocks sammeln (Bulk-Insert) ----
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

    // ---- Alternativen sammeln (Bulk-Insert mit alternativeOfId) ----
    const altRows: NewTrainingPlanSession[] = [];
    type AltPending = {
      altSpec: AiSessionAlternative;
      primarySessionId: number;
    };
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
      altPending.push({
        altSpec: aiSession.alternative,
        primarySessionId: primary.id,
      });
    }

    if (altRows.length > 0) {
      const insertedAlt = await insertPlanSessions(altRows);
      totalAlternatives += insertedAlt.length;

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
  }

  // Plan ist jetzt fertig generiert → status auf "active".
  await setTrainingPlanStatus(plan.id, "active");
  // Generierungs-Modell + Zeitpunkt in notes vermerken (Plan-Metadata-Light).
  await updateTrainingPlan(plan.id, {
    notes: `KI-generiert mit ${model === "opus" ? "Opus 4.8" : "Sonnet 4.6"} am ${new Date().toISOString().slice(0, 10)}.`,
  });

  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");

  return {
    ok: true,
    generated: {
      sessions: totalSessions,
      alternatives: totalAlternatives,
      chunks: chunks.length,
      totalCacheReadTokens: totalCacheRead,
    },
  };
}
