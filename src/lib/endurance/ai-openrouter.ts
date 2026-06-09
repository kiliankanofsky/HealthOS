// ============================================================
// #6 — OpenRouter-Anbindung (OpenAI-kompatibel) für das kostenlose DeepSeek-
// Modell. Kein neues SDK nötig — wir sprechen den /chat/completions-Endpoint
// direkt per fetch an. Genutzt von der Plan-Generierung (forced tool-use) und
// vom Chat (agentischer tool-use Loop).
// ============================================================

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function getKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) {
    throw new Error(
      "OPENROUTER_API_KEY ist nicht gesetzt. Trage ihn in .env.local (lokal) bzw. in den Vercel Environment Variables (Production) ein, um DeepSeek zu nutzen.",
    );
  }
  return k;
}

// ---- OpenAI-kompatible Typen (minimal) ----
export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAITool = {
  type: "function";
  function: { name: string; description?: string; parameters: unknown };
};

type ChatCompletionResponse = {
  // Tatsächlich genutztes Modell (bei Fallback ggf. ein anderes als angefragt).
  model?: string;
  choices: Array<{
    message: { content: string | null; tool_calls?: OpenAIToolCall[] };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

// Konvertiert ein Anthropic-Tool-Schema (name/description/input_schema) in das
// OpenAI-Function-Format. Das JSON-Schema selbst ist identisch.
export function toolToOpenAI(tool: {
  name: string;
  description?: string;
  input_schema: unknown;
}): OpenAITool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

export async function openRouterChat(args: {
  model: string;
  // Optionale Fallback-Modelle: schlägt `model` fehl (z.B. 429), versucht
  // OpenRouter diese der Reihe nach. Wird zu `models: [model, ...fallbacks]`.
  fallbackModels?: string[];
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  toolChoice?: "auto" | { type: "function"; function: { name: string } };
  maxTokens?: number;
}): Promise<ChatCompletionResponse> {
  const useFallback = args.fallbackModels && args.fallbackModels.length > 0;
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      // Optionale OpenRouter-Attribution (für ihr Ranking, schadet nicht).
      "HTTP-Referer": "https://healthos.app",
      "X-Title": "HealthOS",
    },
    body: JSON.stringify({
      // Bei Fallback `models`-Array statt einzelnem `model` schicken.
      ...(useFallback
        ? { models: [args.model, ...(args.fallbackModels ?? [])] }
        : { model: args.model }),
      messages: args.messages,
      ...(args.tools ? { tools: args.tools } : {}),
      ...(args.toolChoice ? { tool_choice: args.toolChoice } : {}),
      max_tokens: args.maxTokens ?? 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as ChatCompletionResponse;
  if (json.error) {
    throw new Error(`OpenRouter-Fehler: ${json.error.message ?? "unbekannt"}`);
  }
  if (!json.choices || json.choices.length === 0) {
    throw new Error("OpenRouter lieferte keine choices zurück.");
  }
  return json;
}
