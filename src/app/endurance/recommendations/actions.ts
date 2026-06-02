"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createTrainingPlan,
  deleteAllPlanSessionsForPlan,
  getBlocksForPlanSession,
  getPlanSessionById,
  getPlanSessionsForDateRange,
  getSessionsForPlan,
  getTrainingPlanById,
  getActiveTrainingPlan,
  getWeekForDate,
  getWeeksForPlan,
  insertPlanWeeks,
  replacePlanBlocksForSession,
  setTrainingPlanStatus,
  updatePlanSession,
  updatePlanSessionDate,
  updateTrainingPlan,
} from "@/lib/db/queries";
import {
  type TrainingPlanBlock,
  type TrainingPlanBlockSegment,
  type TrainingPlanBlockSegmentKind,
  type TrainingPlanSession,
  type TrainingPlanSessionStatus,
  type TrainingPlanSessionType,
  trainingPlanSessionStatuses,
  trainingPlanSessionTypes,
} from "@/lib/db/schema";
import {
  type AiModel,
  chunkWeeks,
  generateChunk,
} from "@/lib/endurance/ai-generator";
import { persistChunkOutput } from "@/lib/endurance/ai-persist";
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
// KI-Plan-Generierung (Sprint 3 + Production-Fix)
// ============================================================
// Vercel-Hobby hat 60s Action-Timeout. Ein Sonnet-Call mit ~24 Sessions
// braucht 30-60s — gefährlich nah am Limit, das Cumulative-Risiko über 4
// sequenzielle Chunks ist garantiert >60s.
//
// Deshalb: Action macht EINEN Chunk pro Call. Der Client (PlanGeneratorButton)
// ruft sie sequenziell auf — jeder einzelne Call bleibt unter 60s.
//
// Die Action ist idempotent pro Chunk: wenn der Chunk schon Sessions hat,
// wird er nicht doppelt generiert (sondern abgelehnt).

export type GenerateChunkState = {
  ok: boolean;
  error?: string;
  // Immer gesetzt (auch bei Fehler ab Validation), damit der Client die
  // Schleife korrekt steuern kann.
  totalChunks?: number;
  chunkIndex?: number;
  isLast?: boolean;
  // Stats, nur bei ok=true.
  generated?: {
    sessions: number;
    alternatives: number;
    cacheReadTokens: number;
  };
};

export async function generatePlanSessions(
  planId: number,
  options: { model?: AiModel; chunkIndex: number },
): Promise<GenerateChunkState> {
  // ---- Plan + Wochen laden, validieren ----
  const plan = await getTrainingPlanById(planId);
  if (!plan) return { ok: false, error: "Plan nicht gefunden." };
  if (plan.status !== "draft") {
    return {
      ok: false,
      error: `Plan-Status ist "${plan.status}". KI-Generierung läuft nur auf draft.`,
    };
  }
  const weeks = await getWeeksForPlan(planId);
  if (weeks.length === 0) {
    return { ok: false, error: "Plan hat keine Wochen — Setup nicht abgeschlossen." };
  }

  // ---- Chunks deterministisch berechnen ----
  const chunks = chunkWeeks(weeks);
  const ci = options.chunkIndex;
  if (ci < 0 || ci >= chunks.length) {
    return {
      ok: false,
      error: `chunkIndex ${ci} ist außerhalb des erlaubten Bereichs (0..${chunks.length - 1}).`,
      totalChunks: chunks.length,
    };
  }
  const chunkWeeksData = chunks[ci];
  const chunkWeekIds = new Set(chunkWeeksData.map((w) => w.id));
  const isLast = ci === chunks.length - 1;

  // ---- Idempotenz: schon Sessions für DIESEN Chunk vorhanden? Skip & next. ----
  const existingSessions = await getSessionsForPlan(planId);
  const sessionsInThisChunk = existingSessions.filter((s) =>
    chunkWeekIds.has(s.weekId),
  );
  if (sessionsInThisChunk.length > 0) {
    // Wenn DIES der letzte Chunk war und er schon Sessions hat → Plan ist
    // de facto fertig, aber wir wurden mit altem Status aufgerufen.
    if (isLast && plan.status === "draft") {
      await setTrainingPlanStatus(plan.id, "active");
    }
    return {
      ok: true,
      totalChunks: chunks.length,
      chunkIndex: ci,
      isLast,
      generated: {
        sessions: 0, // 0 = nichts neu generiert, war schon da
        alternatives: 0,
        cacheReadTokens: 0,
      },
    };
  }

  const model = options.model ?? "sonnet";

  // ---- Claude-Call für genau diesen Chunk ----
  let result;
  try {
    result = await generateChunk(plan, chunkWeeksData, model);
  } catch (e) {
    return {
      ok: false,
      error: `KI-Call fehlgeschlagen (Chunk ${ci + 1}/${chunks.length}, Wochen ${chunkWeeksData[0].weekNumber}-${chunkWeeksData[chunkWeeksData.length - 1].weekNumber}): ${(e as Error).message}`,
      totalChunks: chunks.length,
      chunkIndex: ci,
    };
  }

  // ---- DB-Persistierung (geteilt mit dem CLI-Skript) ----
  const persisted = await persistChunkOutput({
    planId,
    allWeeks: weeks,
    output: result.output,
  });
  if (!persisted.ok) {
    return {
      ok: false,
      error: persisted.error,
      totalChunks: chunks.length,
      chunkIndex: ci,
    };
  }

  // ---- Last-Chunk-Finalisierung: Status auf active + Notes ----
  if (isLast) {
    await setTrainingPlanStatus(plan.id, "active");
    await updateTrainingPlan(plan.id, {
      notes: `KI-generiert mit ${model === "opus" ? "Opus 4.8" : "Sonnet 4.6"} am ${new Date().toISOString().slice(0, 10)}.`,
    });
  }

  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");

  return {
    ok: true,
    totalChunks: chunks.length,
    chunkIndex: ci,
    isLast,
    generated: {
      sessions: persisted.primarySessions,
      alternatives: persisted.alternativeSessions,
      cacheReadTokens: result.usage.cacheReadInputTokens,
    },
  };
}

// Reset-Action: alle Sessions+Blocks eines Plans löschen + status auf draft.
// Für Retry-Flow nach Chunk-Fehler.
export type WipePlanState = { ok: boolean; error?: string };

export async function wipePlanSessions(planId: number): Promise<WipePlanState> {
  const plan = await getTrainingPlanById(planId);
  if (!plan) return { ok: false, error: "Plan nicht gefunden." };
  if (plan.status === "completed") {
    return { ok: false, error: "Completed Plan kann nicht zurückgesetzt werden." };
  }
  // Blocks cascaden via FK ON DELETE CASCADE.
  await deleteAllPlanSessionsForPlan(planId);
  // Falls Plan schon mal active war (z.B. lokal generiert), zurück auf draft.
  if (plan.status !== "draft") {
    await setTrainingPlanStatus(planId, "draft");
  }
  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");
  return { ok: true };
}

// ============================================================
// Sprint 4 — Kalender-Drag & Edit-Session-Dialog
// ============================================================

export type MoveSessionState = { ok: boolean; error?: string };

// Verschiebt eine Session per Drag-and-Drop auf einen anderen Tag.
// Aktualisiert auch die Wochen-Zuordnung (weekId), damit die Übersicht
// pro Woche korrekt bleibt. Ablage außerhalb des Plan-Zeitraums wird
// abgelehnt (es gibt dort keine Woche).
export async function movePlanSession(
  sessionId: number,
  newDateIso: string,
): Promise<MoveSessionState> {
  if (!DATE_REGEX.test(newDateIso)) {
    return { ok: false, error: "Ungültiges Datum." };
  }
  const session = await getPlanSessionById(sessionId);
  if (!session) return { ok: false, error: "Session nicht gefunden." };
  if (session.date === newDateIso) return { ok: true }; // No-op (gleicher Tag)

  const week = await getWeekForDate(session.planId, newDateIso);
  if (!week) {
    return {
      ok: false,
      error: "Dieser Tag liegt außerhalb des Plan-Zeitraums.",
    };
  }

  // Double-Day-Kollision vermeiden: liegt am Zieltag schon eine Session,
  // hängt die verschobene als nächste dayOrder hintendran (UNIQUE-Constraint
  // ist (planId, date, dayOrder, alternativeOfId)).
  const sameDay = await getPlanSessionsForDateRange(
    session.planId,
    newDateIso,
    newDateIso,
  );
  const others = sameDay.filter((s) => s.id !== sessionId);
  const dayOrder =
    others.length === 0 ? 1 : Math.max(...others.map((s) => s.dayOrder)) + 1;

  await updatePlanSessionDate(sessionId, newDateIso, dayOrder);
  // weekId getrennt nachziehen (updatePlanSessionDate setzt nur date/dayOrder).
  if (week.id !== session.weekId) {
    await updatePlanSession(sessionId, { weekId: week.id });
  }

  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");
  return { ok: true };
}

// ---- Detail nachladen für den Edit-Dialog ----
// Der Dialog ist eine Client-Komponente und kann nicht selbst die DB lesen;
// beim Öffnen ruft er diese Action, statt dass die Seite alle 264 Blocks
// vorab in den Client-Payload packt.
export type SessionDetail = {
  session: TrainingPlanSession;
  blocks: TrainingPlanBlock[];
};

export async function loadSessionDetail(
  sessionId: number,
): Promise<SessionDetail | null> {
  const session = await getPlanSessionById(sessionId);
  if (!session) return null;
  const blocks = await getBlocksForPlanSession(sessionId);
  return { session, blocks };
}

// ---- Session speichern (Felder + Intervall-Struktur) ----
// Titel/Typ/Status sind direkt editierbar. Distanz, Dauer und primaryZone
// ergeben sich aus den Intervallen und werden serverseitig neu berechnet,
// damit die Anzeige konsistent bleibt.

export type EditSegmentInput = {
  kind: TrainingPlanBlockSegmentKind;
  // Genau eines von beiden gesetzt (Dauer ODER Distanz).
  durationSec?: number | null;
  distanceMeters?: number | null;
  zone: number;
};

export type EditBlockInput = {
  repetitions: number;
  description?: string | null;
  segments: EditSegmentInput[];
};

export type SaveSessionEditsInput = {
  sessionId: number;
  title: string;
  sessionType: TrainingPlanSessionType;
  status: TrainingPlanSessionStatus;
  blocks: EditBlockInput[];
};

export type SaveSessionState = { ok: boolean; error?: string };

const SEGMENT_KINDS: readonly TrainingPlanBlockSegmentKind[] = [
  "warmup",
  "work",
  "recovery",
  "cooldown",
];

export async function saveSessionEdits(
  input: SaveSessionEditsInput,
): Promise<SaveSessionState> {
  const session = await getPlanSessionById(input.sessionId);
  if (!session) return { ok: false, error: "Session nicht gefunden." };

  const title = input.title.trim();
  if (title.length < 1) return { ok: false, error: "Titel fehlt." };
  if (!trainingPlanSessionTypes.includes(input.sessionType)) {
    return { ok: false, error: "Unbekannter Trainingstyp." };
  }
  if (!trainingPlanSessionStatuses.includes(input.status)) {
    return { ok: false, error: "Unbekannter Status." };
  }
  if (input.blocks.length === 0) {
    return { ok: false, error: "Mindestens ein Block erforderlich." };
  }

  // ---- Blocks validieren + Segmente säubern ----
  const cleanBlocks: Omit<TrainingPlanBlock, "id" | "sessionId" | "createdAt">[] = [];
  let totalDurationSec = 0;
  let totalDistanceMeters = 0;
  let dominant: { zone: number; weight: number } | null = null;

  for (let bi = 0; bi < input.blocks.length; bi++) {
    const b = input.blocks[bi];
    const reps = Math.round(b.repetitions);
    if (!Number.isFinite(reps) || reps < 1) {
      return { ok: false, error: `Block ${bi + 1}: Wiederholungen müssen ≥ 1 sein.` };
    }
    if (b.segments.length === 0) {
      return { ok: false, error: `Block ${bi + 1}: mindestens ein Segment.` };
    }

    const segments: TrainingPlanBlockSegment[] = [];
    for (let si = 0; si < b.segments.length; si++) {
      const s = b.segments[si];
      if (!SEGMENT_KINDS.includes(s.kind)) {
        return { ok: false, error: `Block ${bi + 1}, Segment ${si + 1}: ungültige Art.` };
      }
      const zone = Math.round(s.zone);
      if (!Number.isFinite(zone) || zone < 1 || zone > 5) {
        return { ok: false, error: `Block ${bi + 1}, Segment ${si + 1}: Zone muss 1–5 sein.` };
      }
      const dur = s.durationSec ?? null;
      const dist = s.distanceMeters ?? null;
      if ((dur == null || dur <= 0) && (dist == null || dist <= 0)) {
        return {
          ok: false,
          error: `Block ${bi + 1}, Segment ${si + 1}: Dauer oder Distanz angeben.`,
        };
      }
      // Genau ein Maß speichern (Distanz hat Vorrang, falls beide gesetzt sind).
      const seg: TrainingPlanBlockSegment = { kind: s.kind, zone };
      if (dist != null && dist > 0) {
        seg.distanceMeters = Math.round(dist);
      } else if (dur != null && dur > 0) {
        seg.durationSec = Math.round(dur);
      }
      segments.push(seg);

      // Totals + dominante Zone (härtestes Work-Segment prägt den Charakter).
      const segDur = seg.durationSec ?? 0;
      totalDurationSec += segDur * reps;
      totalDistanceMeters += (seg.distanceMeters ?? 0) * reps;
      if (seg.kind === "work") {
        const weight = segDur > 0 ? segDur : (seg.distanceMeters ?? 0);
        if (!dominant || zone > dominant.zone) {
          dominant = { zone, weight };
        }
      }
    }

    cleanBlocks.push({
      blockOrder: bi + 1,
      repetitions: reps,
      segmentsJson: segments,
      description: b.description?.trim() || null,
    });
  }

  // ---- Schreiben ----
  await updatePlanSession(input.sessionId, {
    title,
    sessionType: input.sessionType,
    status: input.status,
    targetDurationSec: totalDurationSec > 0 ? totalDurationSec : null,
    targetDistanceMeters: totalDistanceMeters > 0 ? totalDistanceMeters : null,
    primaryZone: dominant?.zone ?? null,
  });
  await replacePlanBlocksForSession(input.sessionId, cleanBlocks);

  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");
  return { ok: true };
}
