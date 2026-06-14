// ============================================================
// Dashboard — tägliche KI-Overview.
//
// Ein Claude-Haiku-Call mit forced tool-use erzeugt drei kurze deutsche
// Bewertungs-Texte (Endurance / Hypertrophy / Weight) aus dem gemeinsamen
// Daten-Kontext (context.ts) und persistiert sie in dashboard_overviews.
//
// Aufrufer:
//  - Cron /api/cron/sync (best effort, nach den Syncs)
//  - Startseite via Server Action (Self-Heal, wenn der Tages-Eintrag fehlt)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

import {
  getDashboardOverviewForDate,
  upsertDashboardOverview,
} from "@/lib/db/queries";
import type { DashboardOverview } from "@/lib/db/schema";
import { CHAT_MODEL_INFO } from "@/lib/endurance/ai-models";
import { buildHealthContext } from "./context";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht gesetzt (.env.local bzw. Vercel-Env).",
    );
  }
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

// Forced tool-use → garantiert strukturierter Output (wie Plan-Generierung).
const OVERVIEW_TOOL: Anthropic.Tool = {
  name: "write_daily_overview",
  description:
    "Schreibt die drei Tages-Bewertungen für das Dashboard (Endurance, Hypertrophy, Weight).",
  input_schema: {
    type: "object",
    properties: {
      endurance: {
        type: "string",
        description:
          "1–3 kurze Sätze: kommendes Training konkret ansprechen + Fitness-Entwicklung bewerten.",
      },
      hypertrophy: {
        type: "string",
        description:
          "1–3 kurze Sätze: Entwicklung der letzten Gym-Werte (Σe1RM-Trend) + konkrete Empfehlung.",
      },
      weight: {
        type: "string",
        description:
          "1–3 kurze Sätze: Gewichtsentwicklung passend zur aktuellen Phase bewerten (Cut/Bulk/Maintenance) + eine konkrete Änderungs-Empfehlung (z.B. Kalorienziel anpassen oder beibehalten). Lagen Cheat-Day/Cheat-Meal-Tage im Fenster, das anmerken — Rate und Intake sind dann unsicher.",
      },
    },
    required: ["endurance", "hypertrophy", "weight"],
  },
};

const SYSTEM = [
  `Du schreibst die tägliche Kurz-Bewertung für das persönliche Health-Dashboard des Nutzers (Gewicht, Krafttraining, Lauftraining).`,
  ``,
  `REGELN:`,
  `- Deutsch, direkt, ohne Begrüßung oder Floskeln. Pro Bereich 1–3 kurze Sätze.`,
  `- Nenne konkrete Zahlen aus den Daten (kg, km, Δ-Werte), erfinde nichts.`,
  `- WEIGHT: Bewerte die Entwicklung relativ zur aktuellen Phase UND gib eine konkrete Änderungs-Empfehlung.`,
  `  · Cut → Abnahme-Rate der letzten Woche nennen und einordnen (läuft es nach Plan?).`,
  `  · Maintenance → Stabilität bewerten.`,
  `  · Bulk → Zunahme-Rate der letzten Woche nennen und einordnen.`,
  `  · Empfehlung: Weicht die Rate vom Phasen-Ziel ab, empfiehl eine konkrete Anpassung — nutze dafür die "Kalorien-Empfehlung (deterministisch)" aus den Daten (kcal-Ziel rauf/runter). Passt die Rate, sage explizit "beibehalten".`,
  `  · Cheat-Tags: Sind im NUTRITION-Block der letzten 14 Tage Cheat-Day- oder Cheat-Meal-Tage markiert, weise ausdrücklich darauf hin, dass die beobachtete Rate (Wasser-Einlagerung) und der Ø-Intake dadurch verzerrt sind — formuliere die Empfehlung dann vorsichtiger/abwartend statt einer harten Anpassung.`,
  `- HYPERTROPHY: Wie entwickeln sich die letzten Sessions (Σe1RM-Deltas)? Gib eine sinnvolle, konkrete Empfehlung (z.B. welches Workout als Nächstes dran ist oder worauf zu achten ist).`,
  `- ENDURANCE: Sprich das kommende Training kurz an (was, wann, Umfang) und bewerte die Fitness-Entwicklung (CTL-Trend, Form/TSB, ggf. HRV/Erholung).`,
  `- Wenn für einen Bereich Daten fehlen, sage das in einem Satz — nicht spekulieren.`,
].join("\n");

export async function generateDailyOverview(
  todayIso: string,
): Promise<DashboardOverview> {
  const context = await buildHealthContext(todayIso);
  const modelId = CHAT_MODEL_INFO.anthropic.id; // Haiku — günstig, läuft täglich.

  const resp = await getClient().messages.create({
    model: modelId,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [OVERVIEW_TOOL],
    tool_choice: { type: "tool", name: "write_daily_overview" },
    messages: [{ role: "user", content: context }],
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  const input = (toolUse?.input ?? {}) as Record<string, unknown>;
  const text = (key: string): string => {
    const v = input[key];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : "";
  };
  const endurance = text("endurance");
  const hypertrophy = text("hypertrophy");
  const weight = text("weight");
  if (!endurance || !hypertrophy || !weight) {
    throw new Error("KI-Overview unvollständig — bitte erneut generieren.");
  }

  return upsertDashboardOverview({
    date: todayIso,
    enduranceText: endurance,
    hypertrophyText: hypertrophy,
    weightText: weight,
    model: modelId,
  });
}

// Idempotent: vorhandener Tages-Eintrag wird nicht neu generiert.
export async function ensureDailyOverview(
  todayIso: string,
): Promise<DashboardOverview> {
  const existing = await getDashboardOverviewForDate(todayIso);
  if (existing) return existing;
  return generateDailyOverview(todayIso);
}
