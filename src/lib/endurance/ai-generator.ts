import Anthropic from "@anthropic-ai/sdk";

import type { TrainingPlan, TrainingPlanWeek } from "@/lib/db/schema";
import {
  type AiChunkOutput,
  CREATE_TRAINING_CHUNK_TOOL,
} from "@/lib/endurance/ai-schema";
import {
  SYSTEM_METHODOLOGY,
  buildChunkUserMessage,
  buildPlanContextBlock,
} from "@/lib/endurance/ai-prompts";

// ============================================================
// Modell-Wahl
// ============================================================
// Default: Sonnet 4.6 für Iteration (10× günstiger).
// Opus 4.8 für finalen Plan-Generierungs-Lauf.
export type AiModel = "sonnet" | "opus";

const MODEL_IDS: Record<AiModel, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

// ============================================================
// Chunking
// ============================================================
// Vercel-Constraint: 60s Action-Timeout. Pro Chunk ~4 Wochen ≈ 24 Sessions
// ≈ 5-15s Claude-Call (je nach Modell + Caching). 4 Chunks à 4 Wochen für
// einen 16-Wochen-Plan passen sequenziell in ein 60s-Fenster, wenn
// Prompt-Caching greift.
const WEEKS_PER_CHUNK = 4;

export function chunkWeeks(
  weeks: TrainingPlanWeek[],
): TrainingPlanWeek[][] {
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const chunks: TrainingPlanWeek[][] = [];
  for (let i = 0; i < sorted.length; i += WEEKS_PER_CHUNK) {
    chunks.push(sorted.slice(i, i + WEEKS_PER_CHUNK));
  }
  return chunks;
}

// ============================================================
// Anthropic-Client (lazy)
// ============================================================
let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht gesetzt. Trage ihn in .env.local ein (lokal) bzw. in den Vercel Environment Variables (Production).",
    );
  }
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

// ============================================================
// Single Chunk-Call
// ============================================================
// Strategie:
//  - System[0] = Methodik (stabil über alle Plans)
//  - System[1] = Plan-Settings + PDF — mit cache_control:ephemeral. Greift ab
//    Chunk 2 als Cache-Read (~10% Kosten der Originalrechnung).
//  - User = chunk-spezifische Anweisung
//  - tool_choice = forciert das Tool, dh. Claude MUSS strukturiert antworten
//  - thinking: adaptive — Claude entscheidet selbst über Tiefe
export type ChunkResult = {
  output: AiChunkOutput;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
};

export async function generateChunk(
  plan: TrainingPlan,
  chunkWeeks: TrainingPlanWeek[],
  model: AiModel,
): Promise<ChunkResult> {
  const client = getClient();
  const planContext = buildPlanContextBlock(plan);
  const userMessage = buildChunkUserMessage(chunkWeeks, {
    totalWeeks: plan.totalWeeks,
    raceDate: plan.raceDate,
  });

  const response = await client.messages.create({
    model: MODEL_IDS[model],
    max_tokens: 16000,
    // Anmerkung: `thinking: adaptive` ist inkompatibel mit
    // `tool_choice: {type: "tool"}`. Wir brauchen forced tool-use → Thinking
    // wird hier weggelassen. Effort bleibt drin (steuert Tool-Use-Tiefe).
    output_config: { effort: "high" },
    system: [
      { type: "text", text: SYSTEM_METHODOLOGY },
      {
        type: "text",
        text: planContext,
        // PDF-Inhalt + Plan-Settings cachen — stabil über alle 4 Chunk-Calls.
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CREATE_TRAINING_CHUNK_TOOL],
    tool_choice: { type: "tool", name: CREATE_TRAINING_CHUNK_TOOL.name },
    messages: [{ role: "user", content: userMessage }],
  });

  // Mit tool_choice:{type:"tool",name:...} ist der erste tool_use-Block
  // garantiert die strukturierte Antwort.
  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUseBlock) {
    throw new Error(
      `Claude hat kein tool_use zurückgegeben (stop_reason=${response.stop_reason}).`,
    );
  }

  // Light-Validation: Top-Level-Struktur prüfen, Detail-Validation passiert
  // beim DB-Mapping in actions.ts.
  const output = toolUseBlock.input as AiChunkOutput;
  if (!output || !Array.isArray(output.weeks)) {
    throw new Error("Claude-Output hat kein 'weeks'-Array.");
  }

  return {
    output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
