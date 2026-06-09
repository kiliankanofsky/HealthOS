// ============================================================
// #6 — Modell-Registry für die KI-Funktionen (Plan-Generierung + Chat).
//
// Zwei Provider:
//  - "anthropic"  → Claude via @anthropic-ai/sdk (ANTHROPIC_API_KEY)
//  - "openrouter" → kostenloses Open-Source-Modell via OpenRouter
//                   (OPENROUTER_API_KEY), OpenAI-kompatibel. Kein Vision/PDF,
//                   kein Prompt-Caching.
//
// Hinweis: OpenRouter bietet aktuell KEIN kostenloses DeepSeek mehr an. Die
// kostenlosen Open-Source-Modelle sind tool-fähig, aber rate-limitiert (429).
// Deshalb routen wir mit FALLBACK-Liste: schlägt das erste fehl, probiert
// OpenRouter automatisch das nächste.
// ============================================================

export type AiProvider = "anthropic" | "openrouter";

export type ModelInfo = {
  id: string;
  label: string;
  provider: AiProvider;
  // Nur openrouter: weitere Modelle, die OpenRouter bei Fehler/429 der Reihe
  // nach versucht (Fallback-Routing über den `models`-Array-Parameter).
  fallbacks?: string[];
};

// Kostenlose, tool-fähige Open-Source-Modelle auf OpenRouter (Stand: getestet).
// Reihenfolge = Fallback-Priorität. OpenRouter erlaubt im `models`-Array
// MAX. 3 Einträge — daher genau drei.
const FREE_OSS_MODELS = [
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

// Plan-Generierung: Sonnet (Test), Opus (Qualität), Free-OSS (gratis).
export type AiModel = "sonnet" | "opus" | "free";

export const AI_MODELS: Record<AiModel, ModelInfo> = {
  sonnet: { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" },
  opus: { id: "claude-opus-4-8", label: "Opus 4.8", provider: "anthropic" },
  free: {
    id: FREE_OSS_MODELS[0],
    label: "Open-Source (gratis)",
    provider: "openrouter",
    fallbacks: FREE_OSS_MODELS.slice(1),
  },
};

export function modelLabel(model: AiModel): string {
  return AI_MODELS[model]?.label ?? model;
}

// Chat: Anbieter-Wahl (Anthropic = Haiku, günstig & schnell · Free = gratis OSS).
export type ChatModel = "anthropic" | "free";

export const CHAT_MODEL_INFO: Record<ChatModel, ModelInfo> = {
  anthropic: {
    id: "claude-haiku-4-5",
    label: "Claude Haiku",
    provider: "anthropic",
  },
  free: {
    id: FREE_OSS_MODELS[0],
    label: "Open-Source (gratis)",
    provider: "openrouter",
    fallbacks: FREE_OSS_MODELS.slice(1),
  },
};

export function chatModelLabel(model: ChatModel): string {
  return CHAT_MODEL_INFO[model]?.label ?? model;
}
