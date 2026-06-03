// Prompt-Builder für die KI-Plan-Generierung.
//
// Struktur:
//  - SYSTEM[0]: Methodik / Rolle (stabil über alle Plans)
//  - SYSTEM[1]: Plan-Settings + Pace-Zonen (+ Referenz-Text, falls keine
//    native Datei) — wird CACHED.
//  - USER: pro Chunk variabel — welche Wochen + Ziel-Wochenvolumen.
//    Bei nativem Referenz-Upload steckt die Datei (PDF/Bild) als gecachter
//    content-Block davor (siehe ai-generator.ts).
//
// Prompt-Caching reduziert Kosten massiv: ab dem 2. Chunk-Call wird der
// Referenz-Block zum Cache-Read-Preis (~0.1×) statt Voll-Input.

import type { TrainingPlan, TrainingPlanWeek } from "@/lib/db/schema";
import {
  formatPace,
  formatSecondsAsHms,
  targetWeeklyKm,
} from "@/lib/endurance/plan";

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

export const SYSTEM_METHODOLOGY = `Du bist ein erfahrener Lauf-Trainer mit Marathon-Spezialisierung. Deine Aufgabe ist es, einen Referenz-Trainingsplan möglichst originalgetreu in eine strukturierte Datenbank zu überführen.

DEINE PRIORITÄT IST TRANSKRIPTION, NICHT NEUERFINDUNG:
- Liegt eine Referenz (Datei oder Text) vor, übernimm deren Wochen- und Tagesstruktur SO GENAU WIE MÖGLICH: welcher Wochentag welche Art Einheit trägt, das Volumen, die Intervallstruktur und die Paces. Interpretiere nur so viel, wie nötig ist, um die Daten sauber in die DB-Struktur (Sessions + Blocks + Segments) zu bringen.
- Bilde JEDE Einheit auf GENAU EINEN dieser sechs Typen ab — keine weiteren:
  • recovery  – sehr lockere Regeneration (Z1)
  • easy      – lockerer Dauerlauf (Z2)
  • tempo     – zügiger Dauerlauf / Marathon-Pace-Bereich (Z3)
  • threshold – Schwellenarbeit / Tempodauerläufe (Z3–Z4)
  • vo2max    – harte Intervalle (Z4–Z5)
  • long      – langer Lauf

HARTE REGELN:
- RUHETAGE: Für Ruhetage gibst du KEINE Session aus. Ein freier Tag bleibt einfach leer (keine Session-Zeile, kein Typ "rest").
- MAXIMAL EINE Session pro Tag. Keine Doppeltage, kein dayOrder 2.
- LONG RUN immer am selben Wochentag über alle Wochen. Liegt eine Referenz vor, nimm deren Long-Run-Tag; ohne Referenz IMMER Sonntag (dayOfWeek 7).
- VOLUMEN: Halte das je Woche vorgegebene Ziel-Wochenvolumen ein (steht in der User-Nachricht). Es steigt kontinuierlich bis zum Peak und sinkt im Taper — erzeuge KEINE eigenen Volumensprünge.
- RACE-WOCHE (letzte Woche): minimales Volumen — nur der Wettkampf selbst plus 1–2 sehr kurze, lockere Aktivierungsläufe. Keine harten Einheiten mehr.
- PHASEN (base/build/peak/taper/race) sind vorgegeben. Du periodisierst NICHT selbst.
- PACE-ZONEN wörtlich nutzen (Z1–Z5 wie definiert). Erfinde keine neuen Zonen.
- Intervalle IMMER als Blocks mit segments (warmup/work/recovery/cooldown) strukturieren, nicht als Freitext.
- SPRACHE: Titel und Beschreibungen auf Deutsch. Pace-Notation '4:15/km', HF-Notation '155 bpm'.

Du gibst deine Antwort AUSSCHLIESSLICH über das Tool 'create_training_chunk' zurück — kein Freitext-Output.`;

export function buildPlanContextBlock(
  plan: TrainingPlan,
  opts: { hasNativeReference?: boolean } = {},
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

  if (opts.hasNativeReference) {
    parts.push(
      `## REFERENZ-TRAININGSPLAN`,
      `Die Referenz ist dieser Anfrage als Datei (PDF oder Bild) angehängt.`,
      `Lies sie sorgfältig und transkribiere ihre Wochen-/Tagesstruktur 1:1.`,
    );
  } else if (plan.referencePdfText) {
    parts.push(
      `## REFERENZ-TRAININGSPLAN (extrahiert aus ${plan.referencePdfName ?? "Upload"})`,
      `Transkribiere diese Struktur 1:1 (Wochentag → Einheit, Volumen, Paces).`,
      ``,
      plan.referencePdfText,
    );
  } else {
    parts.push(
      `## KEIN REFERENZPLAN HOCHGELADEN`,
      `Erstelle den Plan auf Basis aktueller Marathon-Trainingsmethodik (polarisiert, progressiv).`,
    );
  }

  return parts.join("\n");
}

export function buildChunkUserMessage(
  chunkWeeks: TrainingPlanWeek[],
  plan: Pick<TrainingPlan, "totalWeeks" | "raceDate" | "targetWeeklyKmPeak">,
): string {
  const weekLines = chunkWeeks.map((w) => {
    const volume = targetWeeklyKm(w.weekNumber, plan.totalWeeks, plan.targetWeeklyKmPeak);
    const volumeStr = volume != null ? ` — Ziel-Wochenvolumen ~${volume} km` : "";
    return `- Woche ${w.weekNumber} (${w.startDate} – ${w.endDate}): Phase "${w.phase}"${volumeStr}`;
  });
  return [
    `Generiere die Trainingseinheiten für folgende Wochen des ${plan.totalWeeks}-Wochen-Plans:`,
    ``,
    ...weekLines,
    ``,
    `Race-Tag ist Sonntag der Race-Woche (${plan.raceDate ?? "—"}).`,
    `Beachte die harten Regeln: max. eine Session pro Tag, KEINE Ruhetag-Sessions`,
    `(freie Tage einfach leer lassen), Long Run am selben Wochentag (bevorzugt Sonntag),`,
    `Ziel-Wochenvolumen je Woche einhalten.`,
    `Liefere das Ergebnis ausschließlich über das Tool create_training_chunk.`,
  ].join("\n");
}
