// Prompt-Builder für die KI-Plan-Generierung.
//
// Struktur:
//  - SYSTEM[0]: Methodik / Rolle (stabil über alle Plans)
//  - SYSTEM[1]: Plan-Settings + Pace-Zonen + Referenz-PDF — wird CACHED.
//    Stabil über alle Chunk-Calls desselben Plans, ändert sich nicht innerhalb
//    der ~4 sequentiellen Generierungs-Calls.
//  - USER: pro Chunk variabel — welche Wochen sollen generiert werden.
//
// Prompt-Caching reduziert Kosten massiv: ab dem 2. Chunk-Call wird die
// Referenz-PDF (~20k Zeichen) zum Cache-Read-Preis (~0.1×) statt Voll-Input.

import type { TrainingPlan, TrainingPlanWeek } from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";

// Sortier-stabiles JSON für Pace-Zonen — sonst Cache-Miss durch wechselnde
// Key-Reihenfolge (silent invalidator).
function stableJsonZones(zones: TrainingPlan["paceZonesJson"]): string {
  if (!zones) return "(nicht gesetzt)";
  const lines: string[] = [];
  for (const key of ["z1", "z2", "z3", "z4", "z5"] as const) {
    const z = zones[key];
    lines.push(
      `  ${key.toUpperCase()}: ${formatPace(z.minSec)} – ${formatPace(z.maxSec, { withUnit: true })}`,
    );
  }
  return lines.join("\n");
}

export const SYSTEM_METHODOLOGY = `Du bist ein erfahrener Lauf-Trainer mit Spezialisierung auf Marathon-Vorbereitung.
Du erstellst strukturierte Trainingspläne auf Basis aktueller Sportwissenschaft (polarisiertes Training, Lactate-Threshold-Arbeit, progressives Overload, Marathon-spezifische Anpassungen).

Regeln für deine Pläne:
- ORIENTIERE dich am hochgeladenen Referenzplan: Struktur (welche Session an welchem Tag), Volumen, Intensitätsverteilung.
- RESPEKTIERE die vorgegebenen Wochen-Phasen — du sollst NICHT periodisieren, das ist vorgegeben.
- NUTZE die definierten Pace-Zonen wörtlich. Erfinde keine neuen Zonen.
- STRUKTURIERE Intervalle in Blocks mit segments (work/recovery), nicht in Freitext.
- KEINE generisch-falschen Hinweise. Lieber kürzer als pseudo-wissenschaftlich.
- LANGUAGE: Titel und Beschreibungen auf Deutsch. Pace-Notation '4:15/km'. HF-Notation '155 bpm'.

Wenn der Referenzplan eine Option 2 für eine Session anbietet, übernimm diese als 'alternative'. Wenn nicht, lass das Feld weg.

Du gibst deine Antwort AUSSCHLIESSLICH über das Tool 'create_training_chunk' zurück — kein Freitext-Output.`;

export function buildPlanContextBlock(
  plan: TrainingPlan,
): string {
  const targetTime = formatSecondsAsHms(plan.targetTimeSeconds);
  const targetPace = formatPace(plan.targetPaceSecPerKm, { withUnit: true });

  const parts = [
    `# PLAN-KONTEXT`,
    ``,
    `Plan-Name: ${plan.name}`,
    `Race: ${plan.raceName ?? "—"} am ${plan.raceDate ?? "—"} (${plan.raceDistanceKm ?? "—"} km)`,
    `Zielzeit: ${targetTime}`,
    `Ziel-Pace: ${targetPace}`,
    `Plan-Wochen total: ${plan.totalWeeks}`,
    `Plan-Start: ${plan.planStartDate}`,
    `Peak-Wochenvolumen: ${plan.targetWeeklyKmPeak ?? "(nicht gesetzt)"} km`,
    `Sessions/Woche: ${plan.sessionsPerWeek ?? "(nicht gesetzt)"}`,
    ``,
    `## PACE-ZONEN`,
    stableJsonZones(plan.paceZonesJson),
    ``,
  ];

  if (plan.referencePdfText) {
    parts.push(
      `## REFERENZ-TRAININGSPLAN (extrahiert aus ${plan.referencePdfName ?? "Upload"})`,
      `Nutze diesen Plan als strukturelle und methodische Vorlage.`,
      ``,
      plan.referencePdfText,
    );
  } else {
    parts.push(
      `## KEIN REFERENZPLAN HOCHGELADEN`,
      `Erstelle den Plan auf Basis aktueller Marathon-Trainingsmethodik.`,
    );
  }

  return parts.join("\n");
}

export function buildChunkUserMessage(
  chunkWeeks: TrainingPlanWeek[],
  context: { totalWeeks: number; raceDate: string | null },
): string {
  const weekLines = chunkWeeks.map(
    (w) =>
      `- Woche ${w.weekNumber} (${w.startDate} – ${w.endDate}): Phase "${w.phase}"`,
  );
  return [
    `Generiere die Trainingseinheiten für folgende Wochen des ${context.totalWeeks}-Wochen-Plans:`,
    ``,
    ...weekLines,
    ``,
    `Race-Tag ist Sonntag der Race-Woche (${context.raceDate ?? "—"}).`,
    `Halte die Phase-Vorgabe ein. Pro Woche 5-7 Sessions (Rest-Tage zählen nicht als Session).`,
    `Liefere das Ergebnis ausschließlich über das Tool create_training_chunk.`,
  ].join("\n");
}
