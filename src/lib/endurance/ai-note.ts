// ============================================================
// #10 — Tagesaktuelle KI-Notiz zur NÄCHSTEN Session.
//
// Leitet aus den aktuellen Garmin-Erholungsdaten (HRV, Schlaf, Ruhepuls,
// Training Status) eine kurze, handlungsorientierte Empfehlung für die nächste
// geplante Einheit ab. Wird vom täglichen Cron und vom Sync-Button aktualisiert
// und auf dem aktiven Plan gespeichert (training_plans.next_note_*).
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

import {
  getCurrentTrainingPlan,
  getDailyMetricsBetween,
  getNextPlanSession,
  updateTrainingPlan,
} from "@/lib/db/queries";
import type { TrainingPlanSession } from "@/lib/db/schema";
import { formatSecondsAsHms } from "@/lib/endurance/plan";
import { formatDistance, SESSION_TYPE_LABELS } from "@/lib/endurance/plan-format";
import { toLocalISODate } from "@/lib/utils/date";

// Günstig + schnell — die Notiz ist 1–2 Sätze.
const NOTE_MODEL = "claude-haiku-4-5";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt (.env.local bzw. Vercel-Env).");
  }
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

function isoDaysAgo(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type MetricsRow = Awaited<ReturnType<typeof getDailyMetricsBetween>>[number];

// Verdichtet die letzten Tage zu einem kompakten Health-Kontext für die Notiz.
function metricsContext(rows: MetricsRow[]): string {
  if (rows.length === 0) return "(keine aktuellen Garmin-Daten)";
  const recent = rows.slice(-5);
  const lines = recent.map((m) => {
    const parts: string[] = [m.date];
    if (m.hrvLastNight != null)
      parts.push(`HRV ${m.hrvLastNight}${m.hrvStatus ? ` (${m.hrvStatus})` : ""}`);
    if (m.sleepScore != null) parts.push(`Schlaf ${m.sleepScore}`);
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
    const lo = Math.round(latest.hrvBaselineBalancedLow);
    const hi = Math.round(latest.hrvBaselineBalancedUpper);
    baseline =
      v < latest.hrvBaselineBalancedLow
        ? `\nHRV liegt UNTER dem Balanced-Korridor (${lo}–${hi}) → reduzierte Erholung.`
        : v > latest.hrvBaselineBalancedUpper
          ? `\nHRV liegt über dem Korridor (${lo}–${hi}).`
          : `\nHRV im Balanced-Korridor (${lo}–${hi}).`;
  }
  return lines.join("\n") + baseline;
}

export async function generateNextSessionNote(args: {
  next: TrainingPlanSession;
  metrics: MetricsRow[];
  todayIso: string;
}): Promise<string | null> {
  const { next, metrics, todayIso } = args;
  const client = getClient();

  const dist =
    next.targetDistanceMeters != null ? `, ${formatDistance(next.targetDistanceMeters)}` : "";
  const dur =
    next.targetDurationSec != null ? `, ${formatSecondsAsHms(next.targetDurationSec)}` : "";
  const sessionLine = `${SESSION_TYPE_LABELS[next.sessionType]} "${next.title}" am ${next.date}${dist}${dur}`;

  const system = `Du bist ein erfahrener Lauf-Coach. Schreibe eine SEHR KURZE, tagesaktuelle Empfehlung (1–2 Sätze, höchstens ~35 Wörter) auf Deutsch zur nächsten geplanten Einheit, abgeleitet AUSSCHLIESSLICH aus den Erholungs-/Health-Daten (HRV, Schlaf, Ruhepuls, Training Status).
- Sei konkret und handlungsorientiert.
- Sind die Daten gut: kurz grünes Licht geben.
- HRV unter Korridor / schlechter Schlaf / hoher RHR: zu Zurückhaltung raten (lockerer, kürzer, ggf. harte Einheit verschieben).
- KEIN Markdown, keine Überschrift, keine Anrede, kein Vorspann — gib NUR die Empfehlung als reinen Text aus.`;

  const user = [
    `Heute ist der ${todayIso}.`,
    `Nächste geplante Einheit: ${sessionLine}.`,
    ``,
    `Aktuelle Health-/Erholungsdaten (Garmin):`,
    metricsContext(metrics),
  ].join("\n");

  const resp = await client.messages.create({
    model: NOTE_MODEL,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  return text || null;
}

// Aktualisiert die Tagesnotiz des aktuellen Plans. Idempotent + best-effort:
// kein Plan / keine nächste Session → Notiz wird geleert. Vom Cron + Sync-Button
// aufgerufen.
export async function refreshNextSessionNote(): Promise<{
  generated: boolean;
  note: string | null;
}> {
  const plan = await getCurrentTrainingPlan();
  if (!plan) return { generated: false, note: null };

  const todayIso = toLocalISODate();
  const next = await getNextPlanSession(plan.id, todayIso);
  if (!next) {
    await updateTrainingPlan(plan.id, {
      nextNoteText: null,
      nextNoteForDate: null,
      nextNoteGeneratedAt: todayIso,
    });
    return { generated: false, note: null };
  }

  const metrics = await getDailyMetricsBetween(isoDaysAgo(todayIso, 7), todayIso);
  const note = await generateNextSessionNote({ next, metrics, todayIso });

  await updateTrainingPlan(plan.id, {
    nextNoteText: note,
    nextNoteForDate: next.date,
    nextNoteGeneratedAt: new Date().toISOString(),
  });
  return { generated: note != null, note };
}
