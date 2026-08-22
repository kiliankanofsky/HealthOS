// ============================================================
// Phase 4 Sprint 5 — Agentischer KI-Chat zum Anpassen des Plans.
//
// Claude (Sonnet) bekommt den aktuellen Plan + die letzten Garmin-Erholungs-
// daten als Kontext und eine Reihe von Werkzeugen, mit denen es Sessions
// verschieben, bearbeiten, umstrukturieren, anlegen und löschen kann.
// Tool-Use-Loop: Claude ruft Werkzeuge → wir führen sie gegen die DB aus →
// Ergebnis zurück an Claude → bis es final antwortet. Änderungen werden
// DIREKT angewandt (Entscheidung Sprint 5), der Client refresht danach.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

import {
  createPlanSession,
  deletePlanSession,
  getAllDailyTags,
  getAllNutritionExclusions,
  getAllPhases,
  getAllWeightEntries,
  getDailyMetricsBetween,
  getNutritionEntries,
  getPlanSessionById,
  getPlanSessionsForDateRange,
  getRunSessionsBetween,
  getSessionsForPlan,
  getTrainingPlanById,
  getWeekForDate,
  replacePlanBlocksForSession,
  updatePlanSession,
  updatePlanSessionDate,
} from "@/lib/db/queries";
import type {
  NewTrainingPlanBlock,
  PhaseKind,
  RunLap,
  TrainingPlan,
  TrainingPlanBlockSegment,
  TrainingPlanBlockSegmentKind,
  TrainingPlanSession,
  TrainingPlanSessionStatus,
  TrainingPlanSessionType,
} from "@/lib/db/schema";
import {
  trainingPlanSessionStatuses,
  trainingPlanSessionTypes,
} from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms, type PaceZones } from "@/lib/endurance/plan";
import { formatDistance, SESSION_TYPE_LABELS } from "@/lib/endurance/plan-format";
import { sessionTotals, type SplitsBlock } from "@/lib/endurance/plan-splits";
import { computeFitness } from "@/lib/endurance/training-load";
import {
  buildNutritionRecommendation,
  type NutritionRecommendation,
} from "@/lib/utils/nutrition-recommendation";
import { computeWeightStats, diff, phaseForDate } from "@/lib/utils/weight-stats";
import { germanDateWithWeekday } from "@/lib/utils/date";
import { CHAT_MODEL_INFO, type ChatModel } from "@/lib/endurance/ai-models";
import {
  openRouterChat,
  toolToOpenAI,
  type OpenAIMessage,
} from "@/lib/endurance/ai-openrouter";

const MAX_TOOL_ROUNDS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const SEGMENT_KINDS: readonly TrainingPlanBlockSegmentKind[] = [
  "warmup",
  "work",
  "recovery",
  "cooldown",
];

export type ChatMessage = { role: "user" | "assistant"; content: string };

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt (.env.local bzw. Vercel-Env).");
  }
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

// ============================================================
// Tool-Schemas
// ============================================================

const segmentSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: SEGMENT_KINDS, description: "warmup/work/recovery/cooldown" },
    zone: { type: "integer", minimum: 1, maximum: 5, description: "Pace-Zone 1–5" },
    duration_min: { type: "number", minimum: 0, description: "Dauer in Minuten (ODER distance_m)." },
    distance_m: { type: "number", minimum: 0, description: "Distanz in Metern (ODER duration_min)." },
  },
  required: ["kind", "zone"],
};
const blocksSchema = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    properties: {
      repetitions: { type: "integer", minimum: 1, description: "Wiederholungen des Segment-Musters." },
      description: { type: "string" },
      segments: { type: "array", minItems: 1, items: segmentSchema },
    },
    required: ["repetitions", "segments"],
  },
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "move_session",
    description: "Verschiebt eine bestehende Session auf ein anderes Datum (innerhalb des Plan-Zeitraums).",
    input_schema: {
      type: "object",
      properties: {
        session_id: { type: "integer" },
        new_date: { type: "string", description: "Ziel-Datum YYYY-MM-DD." },
      },
      required: ["session_id", "new_date"],
    },
  },
  {
    name: "update_session",
    description: "Ändert Titel, Trainingstyp und/oder Status einer Session. Für die Intervallstruktur stattdessen set_session_blocks nutzen.",
    input_schema: {
      type: "object",
      properties: {
        session_id: { type: "integer" },
        title: { type: "string" },
        session_type: { type: "string", enum: trainingPlanSessionTypes },
        status: { type: "string", enum: trainingPlanSessionStatuses },
      },
      required: ["session_id"],
    },
  },
  {
    name: "set_session_blocks",
    description: "Ersetzt die komplette Intervallstruktur einer Session. Distanz/Dauer/Zone werden daraus neu berechnet.",
    input_schema: {
      type: "object",
      properties: { session_id: { type: "integer" }, blocks: blocksSchema },
      required: ["session_id", "blocks"],
    },
  },
  {
    name: "delete_session",
    description: "Löscht eine Session (z.B. um einen Ruhetag zu schaffen).",
    input_schema: {
      type: "object",
      properties: { session_id: { type: "integer" } },
      required: ["session_id"],
    },
  },
  {
    name: "create_session",
    description: "Legt eine neue Session an einem Tag an (max. eine Session pro Tag).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD im Plan-Zeitraum." },
        session_type: { type: "string", enum: trainingPlanSessionTypes },
        title: { type: "string" },
        blocks: blocksSchema,
      },
      required: ["date", "session_type", "title", "blocks"],
    },
  },
];

// ============================================================
// System-Kontext
// ============================================================

function paceZonesText(zones: PaceZones | null): string {
  if (!zones) return "(nicht gesetzt)";
  return (["z1", "z2", "z3", "z4", "z5"] as const)
    .map((k) => `${k.toUpperCase()}: ${formatPace(zones[k].minSec)}–${formatPace(zones[k].maxSec, { withUnit: true })}`)
    .join(" · ");
}

function sessionLine(s: TrainingPlanSession): string {
  const wd = WEEKDAYS[new Date(`${s.date}T00:00:00`).getDay()];
  const km = s.targetDistanceMeters != null ? `${(s.targetDistanceMeters / 1000).toFixed(1)}km` : "—";
  const dur = formatSecondsAsHms(s.targetDurationSec);
  return `#${s.id} ${s.date} (${wd}) ${SESSION_TYPE_LABELS[s.sessionType]} "${s.title}" · ${km} · ${dur} · ${s.status}`;
}

// Expliziter Zeit-Anker: heutiger Tag + die unmittelbar anstehenden Einheiten.
// Damit die KI verlässlich weiß, was HEUTE und als Nächstes ansteht — statt das
// aus der flachen Session-Liste raten zu müssen.
function todayAndUpcomingText(
  sessions: TrainingPlanSession[],
  todayIso: string,
): string {
  const sorted = [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.dayOrder - b.dayOrder,
  );
  const todayWd = WEEKDAYS[new Date(`${todayIso}T00:00:00`).getDay()];
  const today = sorted.filter((s) => s.date === todayIso);
  const future = sorted.filter((s) => s.date > todayIso).slice(0, 4);

  const lines = [`Heute ist ${todayWd}, der ${todayIso}.`];
  if (today.length > 0) {
    lines.push(
      `HEUTE geplant: ${today
        .map(
          (s) =>
            `${SESSION_TYPE_LABELS[s.sessionType]} "${s.title}" (#${s.id}, ${s.status})`,
        )
        .join("; ")}`,
    );
  } else {
    lines.push(`HEUTE ist keine Einheit geplant (Ruhetag).`);
  }
  if (future.length > 0) {
    lines.push(`Als Nächstes:`);
    for (const s of future) {
      const wd = WEEKDAYS[new Date(`${s.date}T00:00:00`).getDay()];
      lines.push(
        `  ${s.date} (${wd}): ${SESSION_TYPE_LABELS[s.sessionType]} "${s.title}" (#${s.id})`,
      );
    }
  } else {
    lines.push(`Keine weiteren geplanten Einheiten in der Zukunft.`);
  }
  return lines.join("\n");
}

// Sekunden → "7h 58m" (für Schlafdauer im KI-Kontext).
function formatHoursMinutes(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// Exportiert: auch der ganzheitliche Dashboard-Chat (src/lib/dashboard)
// nutzt diese Kontext-Blöcke.
export function metricsText(
  rows: Awaited<ReturnType<typeof getDailyMetricsBetween>>,
): string {
  if (rows.length === 0) return "(keine aktuellen Garmin-Daten)";
  const recent = rows.slice(-10);
  const lines = recent.map((m) => {
    const parts: string[] = [m.date];
    if (m.hrvLastNight != null) parts.push(`HRV ${m.hrvLastNight}${m.hrvStatus ? ` (${m.hrvStatus})` : ""}`);
    // Sleep-Score (0–100, KEINE Minuten!) + tatsächliche Schlafdauer getrennt,
    // damit die KI Score und Dauer nicht verwechselt.
    if (m.sleepScore != null) parts.push(`Schlaf-Score ${m.sleepScore}/100`);
    if (m.sleepDurationSec != null) parts.push(`Schlafdauer ${formatHoursMinutes(m.sleepDurationSec)}`);
    if (m.restingHeartRate != null) parts.push(`RHR ${m.restingHeartRate}`);
    if (m.trainingStatus) parts.push(`Status ${m.trainingStatus}`);
    return "  " + parts.join(", ");
  });
  const latest = recent[recent.length - 1];
  let baseline = "";
  if (
    latest?.hrvLastNight != null &&
    latest.hrvBaselineBalancedLow != null &&
    latest.hrvBaselineBalancedUpper != null
  ) {
    const v = latest.hrvLastNight;
    const lo = latest.hrvBaselineBalancedLow;
    const hi = latest.hrvBaselineBalancedUpper;
    baseline =
      v < lo
        ? ` HRV liegt UNTER dem Balanced-Korridor (${Math.round(lo)}–${Math.round(hi)}) → reduzierte Erholung.`
        : v > hi
          ? ` HRV liegt über dem Korridor (${Math.round(lo)}–${Math.round(hi)}).`
          : ` HRV im Balanced-Korridor (${Math.round(lo)}–${Math.round(hi)}).`;
  }
  return lines.join("\n") + (baseline ? `\nHinweis:${baseline}` : "");
}

// Charakterisiert einen Lauf anhand seiner Garmin-Laps: gleichmäßig (Recovery/
// Dauerlauf) vs. strukturiert (Intervalle/Tempowechsel). So kann die KI z.B.
// einen 5k-Recovery-Lauf von einem 5k-Intervall-Workout unterscheiden.
function describeLaps(laps: RunLap[] | null | undefined): string | null {
  if (!laps || laps.length < 3) return null;
  const paces = laps
    .filter((l) => l.distanceMeters >= 200 && l.avgPaceSecPerKm != null)
    .map((l) => l.avgPaceSecPerKm as number);
  if (paces.length < 3) return null;
  const sorted = [...paces].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const fast = paces.filter((p) => p <= median * 0.92).length;
  const spread = Math.max(...paces) - Math.min(...paces); // sec/km
  if (fast >= 2 && spread >= 30) {
    return `strukturiert: ${laps.length} Laps, ~${fast} schnelle Abschnitte, Pace-Spanne ${Math.round(spread)}s/km → Intervalle/Workout`;
  }
  if (spread < 20) {
    return `gleichmäßig: ${laps.length} Laps → Dauerlauf/Recovery`;
  }
  return `variabel: ${laps.length} Laps, Pace-Spanne ${Math.round(spread)}s/km`;
}

export function runsText(runs: Awaited<ReturnType<typeof getRunSessionsBetween>>): string {
  if (runs.length === 0) return "(keine Läufe erfasst)";
  // Neueste zuerst, max. 12.
  const recent = [...runs].slice(-12).reverse();
  return recent
    .map((r) => {
      const parts = [
        r.date,
        formatDistance(r.distanceMeters),
        formatPace(r.avgPaceSecPerKm, { withUnit: true }),
      ];
      if (r.avgHeartRate != null) parts.push(`HF ${r.avgHeartRate}`);
      if (r.aerobicTrainingEffect != null) parts.push(`TE ${r.aerobicTrainingEffect.toFixed(1)}`);
      if (r.trainingLoad != null) parts.push(`Load ${Math.round(r.trainingLoad)}`);
      const laps = describeLaps(r.lapsJson);
      if (laps) parts.push(laps);
      return "  " + parts.join(" · ");
    })
    .join("\n");
}

export function fitnessText(fitness: ReturnType<typeof computeFitness>): string {
  if (fitness.daysCovered === 0) return "(zu wenig Lauf-Daten für Fitness/Fatigue)";
  const { ctl, atl, tsb } = fitness.current;
  const lines = [
    `Fitness (CTL, 42-Tage): ${ctl} · Fatigue (ATL, 7-Tage): ${atl} · Form (TSB): ${tsb}`,
  ];
  if (fitness.fourWeeksAgo) {
    const trend = ctl > fitness.fourWeeksAgo.ctl ? "steigend" : ctl < fitness.fourWeeksAgo.ctl ? "fallend" : "stabil";
    lines.push(`Vor 4 Wochen: CTL ${fitness.fourWeeksAgo.ctl} → Fitness-Trend ${trend}.`);
  }
  lines.push(
    `Deutung: TSB deutlich negativ = ermüdet/im Aufbau, um 0 = ausbalanciert, deutlich positiv = frisch/erholt (Tapering). Steigende CTL = wachsende Fitness.`,
  );
  return lines.join("\n");
}

// Kompakter Gewicht/Phasen-Block, damit der Trainings-Assistent dieselbe Phase
// + Kalorien-Empfehlung kennt wie Dashboard & Weight-Card (z.B. um Ernährung
// in Race-Vorbereitung/Tapering einzuordnen).
const PHASE_LABELS_AI: Record<PhaseKind, string> = {
  cut: "Cut (Defizit)",
  bulk: "Bulk (Aufbau)",
  maintenance: "Maintenance (Erhalt)",
};
function weightPhaseText(args: {
  weightEntries: Awaited<ReturnType<typeof getAllWeightEntries>>;
  rec: NutritionRecommendation;
  todayIso: string;
  phaseKind: PhaseKind | null;
  phaseStartDate: string | null;
}): string {
  const { weightEntries, rec, phaseKind, phaseStartDate } = args;
  if (weightEntries.length === 0) return "(keine Gewichtsdaten)";
  const stats = computeWeightStats(weightEntries);
  const weekDelta = diff(stats.weekAvg.avg, stats.prevWeekAvg.avg);
  const kg = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} kg`);
  const sKg = (v: number | null) =>
    v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)} kg`;
  const lines = [
    `Phase: ${phaseKind ? `${PHASE_LABELS_AI[phaseKind]}${phaseStartDate ? ` seit ${phaseStartDate}` : ""}` : "(keine Phase hinterlegt)"}`,
    `Gewicht: ${kg(stats.current)} (7-Tage-Ø ${kg(stats.weekAvg.avg)}, Δ Woche ${sKg(weekDelta)})`,
  ];
  if (rec.phaseKind != null && rec.recommendedIntakeKcal != null && rec.adjustmentKcal != null) {
    lines.push(
      `Kalorien-Empfehlung: ~${rec.recommendedIntakeKcal} kcal/Tag (${rec.adjustmentKcal > 0 ? "+" : ""}${rec.adjustmentKcal} ggü. Ø-Intake), Ziel ${sKg(rec.targetWeeklyDeltaKg)}/Woche vs. beobachtet ${sKg(rec.observedWeeklyDeltaKg)}/Woche.`,
    );
  }
  return lines.join("\n");
}

function buildSystem(args: {
  plan: TrainingPlan;
  sessions: TrainingPlanSession[];
  todayIso: string;
  metrics: Awaited<ReturnType<typeof getDailyMetricsBetween>>;
  runs: Awaited<ReturnType<typeof getRunSessionsBetween>>;
  fitness: ReturnType<typeof computeFitness>;
  weightText: string;
}): string {
  const { plan, sessions, todayIso, metrics, runs, fitness, weightText } = args;
  return [
    `Heute ist ${germanDateWithWeekday(todayIso)} (ISO ${todayIso}). Das ist das aktuelle Datum — alle zeitbezogenen Aussagen ("heute", "morgen", "diese Woche", "kommend") beziehen sich ausschließlich darauf.`,
    ``,
    `Du bist der Trainings-Assistent für HealthOS und hilfst dem Nutzer, seinen Lauf-Trainingsplan im Dialog anzupassen.`,
    ``,
    `ARBEITSWEISE:`,
    `- Setze gewünschte Änderungen DIREKT über die Werkzeuge um (verschieben, bearbeiten, Intervalle ersetzen, anlegen, löschen). Frage nicht um Erlaubnis — der Nutzer sieht das Ergebnis sofort im Kalender.`,
    `- Wenn der Nutzer nur eine Frage stellt, antworte ohne Werkzeuge.`,
    `- Identifiziere Sessions über ihre #ID aus der Liste unten.`,
    `- Antworte am Ende kurz auf Deutsch und fasse zusammen, was du geändert hast (mit Datum/Typ).`,
    `- Halte Chat-Antworten knapp und konkret (kurze Sätze/Stichpunkte, sparsam mit Tabellen). Markdown (**fett**, Listen) wird gerendert.`,
    `- Du kennst die TRAININGSHISTORIE + Fitness/Fatigue/Form unten — nutze sie, um fundierte, datenbasierte Empfehlungen zu geben.`,
    ``,
    `REGELN (wie bei der Plan-Erstellung):`,
    `- Nur diese 6 Trainingstypen: recovery, easy, tempo, threshold, vo2max, long.`,
    `- Max. EINE Session pro Tag (keine Doppeltage). Ruhetage = einfach keine Session (ggf. löschen).`,
    `- Long Run möglichst am selben Wochentag halten.`,
    `- Pace-Zonen wörtlich nutzen: ${paceZonesText(plan.paceZonesJson)}`,
    `- Bei Erholungs-Hinweisen (HRV/Schlaf): konservativ anpassen, nichts überschreiben, was der Nutzer nicht will.`,
    ``,
    `PLAN: ${plan.name} — Race ${plan.raceName ?? "—"} am ${plan.raceDate ?? "—"}, Ziel ${formatSecondsAsHms(plan.targetTimeSeconds)} (${formatPace(plan.targetPaceSecPerKm, { withUnit: true })}). Heute ist ${todayIso}.`,
    ``,
    `HEUTE & NÄCHSTE EINHEITEN:`,
    todayAndUpcomingText(sessions, todayIso),
    ``,
    `SESSIONS (#ID Datum (Tag) Typ "Titel" · Distanz · Dauer · Status):`,
    ...sessions.map(sessionLine),
    ``,
    `LETZTE ERHOLUNGSDATEN (Garmin):`,
    metricsText(metrics),
    ``,
    `FITNESS / FATIGUE / FORM (aus Garmin Training Load):`,
    fitnessText(fitness),
    ``,
    `GEWICHT / PHASE (gleiche Daten wie Dashboard & Weight-Seite):`,
    weightText,
    ``,
    `TRAININGSHISTORIE (letzte absolvierte Läufe — inkl. Lauf-Struktur aus Garmin-Laps):`,
    `Nutze die Struktur ("gleichmäßig" vs. "strukturiert/Intervalle"), um die tatsächliche Belastung einzuschätzen — ein 5k-Recovery zählt anders als 5k mit Intervallen.`,
    runsText(runs),
  ].join("\n");
}

// ============================================================
// Tool-Ausführung
// ============================================================

type ToolResult = { ok: boolean; mutated: boolean; message: string };

function asInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Tool-Block-Input → DB-Blocks + Totals.
function buildBlocks(
  rawBlocks: unknown,
):
  | { ok: true; blocks: Omit<NewTrainingPlanBlock, "sessionId">[]; durationSec: number; distanceMeters: number; primaryZone: number | null; zones: PaceZones | null }
  | { ok: false; error: string } {
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return { ok: false, error: "blocks fehlt oder leer." };
  }
  const blocks: Omit<NewTrainingPlanBlock, "sessionId">[] = [];
  let dominant: number | null = null;
  for (let bi = 0; bi < rawBlocks.length; bi++) {
    const b = rawBlocks[bi] as { repetitions?: unknown; description?: unknown; segments?: unknown };
    const reps = asInt(b.repetitions) ?? 1;
    if (reps < 1) return { ok: false, error: `Block ${bi + 1}: repetitions < 1.` };
    if (!Array.isArray(b.segments) || b.segments.length === 0) {
      return { ok: false, error: `Block ${bi + 1}: segments fehlt.` };
    }
    const segs: TrainingPlanBlockSegment[] = [];
    for (let si = 0; si < b.segments.length; si++) {
      const s = b.segments[si] as {
        kind?: unknown;
        zone?: unknown;
        duration_min?: unknown;
        distance_m?: unknown;
      };
      if (!SEGMENT_KINDS.includes(s.kind as TrainingPlanBlockSegmentKind)) {
        return { ok: false, error: `Block ${bi + 1} Segment ${si + 1}: ungültige kind.` };
      }
      const zone = asInt(s.zone);
      if (zone == null || zone < 1 || zone > 5) {
        return { ok: false, error: `Block ${bi + 1} Segment ${si + 1}: zone muss 1–5 sein.` };
      }
      const durMin = s.duration_min != null ? Number(s.duration_min) : null;
      const distM = s.distance_m != null ? Number(s.distance_m) : null;
      const seg: TrainingPlanBlockSegment = { kind: s.kind as TrainingPlanBlockSegmentKind, zone };
      if (distM != null && distM > 0) seg.distanceMeters = Math.round(distM);
      else if (durMin != null && durMin > 0) seg.durationSec = Math.round(durMin * 60);
      else return { ok: false, error: `Block ${bi + 1} Segment ${si + 1}: duration_min oder distance_m angeben.` };
      segs.push(seg);
      if (seg.kind === "work" && (dominant == null || zone > dominant)) dominant = zone;
    }
    blocks.push({
      blockOrder: bi + 1,
      repetitions: reps,
      segmentsJson: segs,
      description: typeof b.description === "string" ? b.description : null,
    });
  }
  return { ok: true, blocks, durationSec: 0, distanceMeters: 0, primaryZone: dominant, zones: null };
}

async function executeTool(
  plan: TrainingPlan,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const zones = plan.paceZonesJson ?? null;
  try {
    switch (name) {
      case "move_session": {
        const id = asInt(input.session_id);
        const date = String(input.new_date ?? "");
        if (id == null) return { ok: false, mutated: false, message: "session_id fehlt." };
        if (!DATE_RE.test(date)) return { ok: false, mutated: false, message: "new_date ungültig." };
        const s = await getPlanSessionById(id);
        if (!s || s.planId !== plan.id) return { ok: false, mutated: false, message: `Session #${id} nicht gefunden.` };
        const week = await getWeekForDate(plan.id, date);
        if (!week) return { ok: false, mutated: false, message: `${date} liegt außerhalb des Plan-Zeitraums.` };
        const sameDay = (await getPlanSessionsForDateRange(plan.id, date, date)).filter((x) => x.id !== id);
        const dayOrder = sameDay.length === 0 ? 1 : Math.max(...sameDay.map((x) => x.dayOrder)) + 1;
        await updatePlanSessionDate(id, date, dayOrder);
        if (week.id !== s.weekId) await updatePlanSession(id, { weekId: week.id });
        return { ok: true, mutated: true, message: `Session #${id} ("${s.title}") auf ${date} verschoben.` };
      }
      case "update_session": {
        const id = asInt(input.session_id);
        if (id == null) return { ok: false, mutated: false, message: "session_id fehlt." };
        const s = await getPlanSessionById(id);
        if (!s || s.planId !== plan.id) return { ok: false, mutated: false, message: `Session #${id} nicht gefunden.` };
        const patch: Partial<TrainingPlanSession> = {};
        if (typeof input.title === "string" && input.title.trim()) patch.title = input.title.trim();
        if (input.session_type != null) {
          if (!trainingPlanSessionTypes.includes(input.session_type as TrainingPlanSessionType))
            return { ok: false, mutated: false, message: "Ungültiger session_type." };
          patch.sessionType = input.session_type as TrainingPlanSessionType;
        }
        if (input.status != null) {
          if (!trainingPlanSessionStatuses.includes(input.status as TrainingPlanSessionStatus))
            return { ok: false, mutated: false, message: "Ungültiger status." };
          patch.status = input.status as TrainingPlanSessionStatus;
        }
        if (Object.keys(patch).length === 0) return { ok: false, mutated: false, message: "Nichts zu ändern." };
        await updatePlanSession(id, patch);
        return { ok: true, mutated: true, message: `Session #${id} aktualisiert (${Object.keys(patch).join(", ")}).` };
      }
      case "set_session_blocks": {
        const id = asInt(input.session_id);
        if (id == null) return { ok: false, mutated: false, message: "session_id fehlt." };
        const s = await getPlanSessionById(id);
        if (!s || s.planId !== plan.id) return { ok: false, mutated: false, message: `Session #${id} nicht gefunden.` };
        const built = buildBlocks(input.blocks);
        if (!built.ok) return { ok: false, mutated: false, message: built.error };
        await replacePlanBlocksForSession(id, built.blocks);
        const totals = sessionTotals(built.blocks as SplitsBlock[], zones);
        await updatePlanSession(id, {
          targetDurationSec: totals.durationSec > 0 ? totals.durationSec : null,
          targetDistanceMeters: totals.distanceMeters > 0 ? totals.distanceMeters : null,
          primaryZone: built.primaryZone,
        });
        return { ok: true, mutated: true, message: `Intervalle von #${id} ersetzt (${formatDistance(totals.distanceMeters)}, ${formatSecondsAsHms(totals.durationSec)}).` };
      }
      case "delete_session": {
        const id = asInt(input.session_id);
        if (id == null) return { ok: false, mutated: false, message: "session_id fehlt." };
        const s = await getPlanSessionById(id);
        if (!s || s.planId !== plan.id) return { ok: false, mutated: false, message: `Session #${id} nicht gefunden.` };
        await deletePlanSession(id);
        return { ok: true, mutated: true, message: `Session #${id} ("${s.title}") gelöscht.` };
      }
      case "create_session": {
        const date = String(input.date ?? "");
        if (!DATE_RE.test(date)) return { ok: false, mutated: false, message: "date ungültig." };
        if (!trainingPlanSessionTypes.includes(input.session_type as TrainingPlanSessionType))
          return { ok: false, mutated: false, message: "Ungültiger session_type." };
        const title = String(input.title ?? "").trim();
        if (!title) return { ok: false, mutated: false, message: "title fehlt." };
        const week = await getWeekForDate(plan.id, date);
        if (!week) return { ok: false, mutated: false, message: `${date} liegt außerhalb des Plan-Zeitraums.` };
        const built = buildBlocks(input.blocks);
        if (!built.ok) return { ok: false, mutated: false, message: built.error };
        const sameDay = await getPlanSessionsForDateRange(plan.id, date, date);
        const dayOrder = sameDay.length === 0 ? 1 : Math.max(...sameDay.map((x) => x.dayOrder)) + 1;
        const totals = sessionTotals(built.blocks as SplitsBlock[], zones);
        const created = await createPlanSession({
          planId: plan.id,
          weekId: week.id,
          date,
          dayOrder,
          sessionType: input.session_type as TrainingPlanSessionType,
          title,
          description: null,
          targetDurationSec: totals.durationSec > 0 ? totals.durationSec : null,
          targetDistanceMeters: totals.distanceMeters > 0 ? totals.distanceMeters : null,
          primaryZone: built.primaryZone,
          status: "planned",
          aiLocked: false,
          alternativeOfId: null,
          selectedAlternativeId: null,
          runSessionId: null,
        });
        await replacePlanBlocksForSession(created.id, built.blocks);
        return { ok: true, mutated: true, message: `Neue Session #${created.id} "${title}" am ${date} angelegt.` };
      }
      default:
        return { ok: false, mutated: false, message: `Unbekanntes Werkzeug: ${name}` };
    }
  } catch (e) {
    return { ok: false, mutated: false, message: `Fehler: ${(e as Error).message}` };
  }
}

// ============================================================
// Chat-Loop
// ============================================================

export async function runPlanChat(
  planId: number,
  history: ChatMessage[],
  todayIso: string,
  model: ChatModel = "anthropic",
): Promise<{ reply: string; changed: boolean }> {
  const plan = await getTrainingPlanById(planId);
  if (!plan) return { reply: "Kein Plan gefunden.", changed: false };

  const sessions = await getSessionsForPlan(planId);
  const [
    metrics,
    runsRaw,
    weightEntries,
    phases,
    nutrition,
    dailyTags,
    exclusions,
  ] = await Promise.all([
    getDailyMetricsBetween(isoDaysAgo(todayIso, 14), todayIso),
    // 180 Tage, damit die 42-Tage-CTL gut "aufgewärmt" ist.
    getRunSessionsBetween(isoDaysAgo(todayIso, 180), todayIso),
    getAllWeightEntries(),
    getAllPhases(),
    getNutritionEntries({ from: isoDaysAgo(todayIso, 13), to: todayIso }),
    getAllDailyTags(),
    getAllNutritionExclusions(),
  ]);
  const runs = [...runsRaw].sort((a, b) => a.date.localeCompare(b.date));
  const fitness = computeFitness(
    runs.map((r) => ({ date: r.date, trainingLoad: r.trainingLoad })),
    todayIso,
  );

  // Gewicht/Phase + deterministische Kalorien-Empfehlung — gleiche Engine wie
  // Dashboard/Weight-Card, damit der Assistent dieselbe Phase nennt.
  const phase = phaseForDate(phases, todayIso);
  const tagsInWindow = dailyTags.filter(
    (t) => t.date >= isoDaysAgo(todayIso, 13) && t.date <= todayIso,
  );
  const rec = buildNutritionRecommendation({
    weightEntries,
    phases,
    nutrition,
    tags: tagsInWindow,
    exclusions,
    todayIso,
  });
  const weightText = weightPhaseText({
    weightEntries,
    rec,
    todayIso,
    phaseKind: phase?.kind ?? null,
    phaseStartDate: phase?.startDate ?? null,
  });

  const system = buildSystem({
    plan,
    sessions,
    todayIso,
    metrics,
    runs,
    fitness,
    weightText,
  });

  const info = CHAT_MODEL_INFO[model];
  if (info.provider === "openrouter") {
    return runChatOpenRouter(plan, system, history, info.id, info.fallbacks);
  }
  return runChatAnthropic(plan, system, history, info.id);
}

// ---- Anthropic-Loop (Claude, native tool-use) ----
async function runChatAnthropic(
  plan: TrainingPlan,
  system: string,
  history: ChatMessage[],
  modelId: string,
): Promise<{ reply: string; changed: boolean }> {
  const client = getClient();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let changed = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await client.messages.create({
      model: modelId,
      max_tokens: 2048,
      system,
      tools: TOOLS,
      messages,
    });

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text || "Erledigt.", changed };
    }

    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const r = await executeTool(plan, tu.name, (tu.input ?? {}) as Record<string, unknown>);
      if (r.mutated) changed = true;
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: r.message,
        is_error: !r.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }

  return {
    reply: "Das war komplexer als erwartet — ich habe nach mehreren Schritten abgebrochen. Bitte formuliere die Anpassung etwas kleiner.",
    changed,
  };
}

// ---- OpenRouter/DeepSeek-Loop (OpenAI-kompatibles tool-calling) ----
async function runChatOpenRouter(
  plan: TrainingPlan,
  system: string,
  history: ChatMessage[],
  modelId: string,
  fallbacks?: string[],
): Promise<{ reply: string; changed: boolean }> {
  const tools = TOOLS.map((t) =>
    toolToOpenAI({ name: t.name, description: t.description, input_schema: t.input_schema }),
  );
  const messages: OpenAIMessage[] = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let changed = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await openRouterChat({
      model: modelId,
      fallbackModels: fallbacks,
      messages,
      tools,
      toolChoice: "auto",
      maxTokens: 2048,
    });
    const msg = resp.choices[0].message;
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return { reply: (msg.content ?? "").trim() || "Erledigt.", changed };
    }

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        // Ungültige Argumente → leeres Objekt, executeTool meldet den Fehler.
      }
      const r = await executeTool(plan, tc.function.name, input);
      if (r.mutated) changed = true;
      messages.push({ role: "tool", tool_call_id: tc.id, content: r.message });
    }
  }

  return {
    reply:
      "Das war komplexer als erwartet — ich habe nach mehreren Schritten abgebrochen. Bitte formuliere die Anpassung etwas kleiner.",
    changed,
  };
}

function isoDaysAgo(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
