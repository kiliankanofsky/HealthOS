// ============================================================
// Dashboard — ganzheitlicher KI-Chat.
//
// Reduzierte Variante des Plan-Chats (endurance/ai-chat.ts): KEINE
// Werkzeuge, keine Plan-Mutationen — reines Frage-und-Antwort über ALLE
// Daten der App. Der System-Prompt bekommt den gemeinsamen Daten-Kontext
// (context.ts): Garmin-Erholung, Läufe, Trainingsplan, Gym-Sessions,
// Gewicht + Phase, Nutrition. So hat die KI immer den aktuellen Stand.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

import { CHAT_MODEL_INFO } from "@/lib/endurance/ai-models";
import { buildHealthContext } from "./context";

export type DashboardChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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

const PERSONA = [
  `Du bist der persönliche Health-Assistent für HealthOS und kennst alle Daten des Nutzers: Gewicht + Phase, Ernährung, Krafttraining (Gym), Lauftraining inkl. Trainingsplan und Garmin-Erholungsdaten.`,
  ``,
  `ARBEITSWEISE:`,
  `- Beantworte Fragen ganzheitlich — verknüpfe die Bereiche, wenn es hilft (z.B. Schlaf ↔ Trainingsqualität, Kalorien ↔ Gewichtstrend).`,
  `- Stütze dich NUR auf die Daten unten, erfinde nichts. Fehlen Daten, sage das.`,
  `- Antworte kurz und konkret auf Deutsch (kurze Sätze/Stichpunkte). Markdown (**fett**, Listen) wird gerendert.`,
  `- Du kannst nichts an Plänen oder Daten ändern — verweise dafür auf die jeweiligen Seiten (Plan-Anpassungen: Endurance → Empfohlene Trainings).`,
].join("\n");

export async function runDashboardChat(
  history: DashboardChatMessage[],
  todayIso: string,
): Promise<{ reply: string }> {
  const context = await buildHealthContext(todayIso);
  const system = `${PERSONA}\n\n=== AKTUELLE DATEN ===\n${context}`;

  const resp = await getClient().messages.create({
    model: CHAT_MODEL_INFO.anthropic.id, // Haiku — wie der Plan-Chat.
    max_tokens: 1536,
    system,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  const reply = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { reply: reply || "Dazu habe ich gerade keine Antwort." };
}
