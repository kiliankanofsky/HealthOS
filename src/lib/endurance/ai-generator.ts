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
import { AI_MODELS, type AiModel } from "@/lib/endurance/ai-models";
import { openRouterChat, toolToOpenAI } from "@/lib/endurance/ai-openrouter";

// ============================================================
// Modell-Wahl
// ============================================================
// "sonnet" (Test, günstig) / "opus" (Qualität) via Anthropic, oder
// "deepseek" (kostenlos) via OpenRouter. Definition: ai-models.ts.
// Re-Export, damit bestehende Importe aus ai-generator weiter funktionieren.
export type { AiModel };

// ============================================================
// Chunking
// ============================================================
// Vercel-Hobby-Constraint: 60s pro Server-Action. Mit Referenz-PDF (~20k
// Zeichen Kontext) braucht ein 4-Wochen-Chunk mit ~24 Sessions ~60s. Zu
// nah am Limit (Production-Test 2026-06-02: timeout bei 60125ms).
//
// Deshalb 2 Wochen pro Chunk → ~12 Sessions/Call → ~25-30s. Sicher unter
// dem Limit auch bei Cold-Start + warmer PDF-Cache fängt das ab Chunk 2 ab.
// Trade-off: 8 statt 4 Chunks (~4 statt ~3 Min total), aber funktioniert.
const WEEKS_PER_CHUNK = 2;

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

// Baut den nativen Referenz-content-Block aus der gespeicherten base64-Datei.
// PDF → document-Block, Bild → image-Block. cache_control:ephemeral, damit der
// (große) Datei-Block ab Chunk 2 als Cache-Read abgerechnet wird.
const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

function buildReferenceBlock(
  plan: TrainingPlan,
): Anthropic.ContentBlockParam | null {
  const data = plan.referenceFileBase64;
  const mediaType = plan.referenceFileMediaType;
  if (!data || !mediaType) return null;

  if (mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
      cache_control: { type: "ephemeral" },
    };
  }
  if ((IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType as ImageMediaType, data },
      cache_control: { type: "ephemeral" },
    };
  }
  return null;
}

// Dispatcher: wählt anhand des Providers den Anthropic- oder OpenRouter-Pfad.
export async function generateChunk(
  plan: TrainingPlan,
  chunkWeeks: TrainingPlanWeek[],
  model: AiModel,
): Promise<ChunkResult> {
  const info = AI_MODELS[model];
  if (info.provider === "openrouter") {
    return generateChunkOpenRouter(plan, chunkWeeks, info.id, info.fallbacks);
  }
  return generateChunkAnthropic(plan, chunkWeeks, info.id);
}

async function generateChunkAnthropic(
  plan: TrainingPlan,
  chunkWeeks: TrainingPlanWeek[],
  modelId: string,
): Promise<ChunkResult> {
  const client = getClient();

  // Native Referenzdatei (PDF/Bild) als gecachten content-Block — Claude liest
  // sie via Vision direkt, statt aus verlustbehaftet extrahiertem Text. Der
  // Block sitzt VOR der variablen Chunk-Anweisung, damit der Cache-Prefix
  // (System + Datei) über alle Chunk-Calls stabil bleibt.
  const referenceBlock = buildReferenceBlock(plan);
  const hasNativeReference = referenceBlock != null;

  const planContext = buildPlanContextBlock(plan, { hasNativeReference });
  const userMessage = buildChunkUserMessage(chunkWeeks, plan);

  const userContent: Anthropic.ContentBlockParam[] = [];
  if (referenceBlock) userContent.push(referenceBlock);
  userContent.push({ type: "text", text: userMessage });

  const response = await client.messages.create({
    model: modelId,
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
        // Plan-Settings (+ Referenz-Text, falls keine native Datei) cachen.
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CREATE_TRAINING_CHUNK_TOOL],
    tool_choice: { type: "tool", name: CREATE_TRAINING_CHUNK_TOOL.name },
    messages: [{ role: "user", content: userContent }],
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

// DeepSeek via OpenRouter (OpenAI-kompatibel). Unterschiede zum Anthropic-Pfad:
//  - KEIN Vision/PDF: die Referenz wird als extrahierter Text mitgegeben
//    (hasNativeReference:false). Rein bild-basierte Pläne kann DeepSeek nicht
//    lesen — dann generiert es aus Methodik + Plan-Settings.
//  - KEIN Prompt-Caching (jeder Chunk schickt System + Kontext voll).
//  - Forced tool-use via OpenAI tool_choice.
async function generateChunkOpenRouter(
  plan: TrainingPlan,
  chunkWeeks: TrainingPlanWeek[],
  modelId: string,
  fallbacks?: string[],
): Promise<ChunkResult> {
  const planContext = buildPlanContextBlock(plan, { hasNativeReference: false });
  const userMessage = buildChunkUserMessage(chunkWeeks, plan);
  const tool = toolToOpenAI(CREATE_TRAINING_CHUNK_TOOL);

  const resp = await openRouterChat({
    model: modelId,
    fallbackModels: fallbacks,
    messages: [
      { role: "system", content: `${SYSTEM_METHODOLOGY}\n\n${planContext}` },
      { role: "user", content: userMessage },
    ],
    tools: [tool],
    toolChoice: { type: "function", function: { name: CREATE_TRAINING_CHUNK_TOOL.name } },
    maxTokens: 8000,
  });

  const call = resp.choices[0]?.message?.tool_calls?.[0];
  if (!call) {
    throw new Error(
      `DeepSeek hat kein tool_call zurückgegeben (finish_reason=${resp.choices[0]?.finish_reason}).`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    throw new Error("DeepSeek-Tool-Argumente sind kein valides JSON.");
  }
  const output = parsed as AiChunkOutput;
  if (!output || !Array.isArray(output.weeks)) {
    throw new Error("DeepSeek-Output hat kein 'weeks'-Array.");
  }

  return {
    output,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
  };
}
