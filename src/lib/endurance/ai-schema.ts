// Tool-Use-Schema für die KI-Plan-Generierung.
//
// Claude bekommt EIN Tool ("create_training_chunk") und wird via tool_choice
// gezwungen, es aufzurufen. Das Tool-Input ist die Liste der Sessions, die
// in den 4 Wochen des Chunks generiert werden — strukturiert, nicht als
// Freitext.
//
// Die TS-Typen spiegeln das JSON-Schema 1:1, damit wir nach `JSON.parse`
// type-safe arbeiten können.
//
// WICHTIG: Schema-Felder müssen mit der DB-Struktur (training_plan_sessions,
// training_plan_blocks) kompatibel sein. Mapping passiert in actions.ts.

import type Anthropic from "@anthropic-ai/sdk";

import type {
  TrainingPlanBlockSegment,
  TrainingPlanSessionType,
} from "@/lib/db/schema";

// ============================================================
// TS-Typen für den Tool-Input
// ============================================================

export type AiSessionBlock = {
  blockOrder: number;
  repetitions: number;
  description?: string;
  segments: TrainingPlanBlockSegment[];
};

export type AiSessionAlternative = {
  sessionType: TrainingPlanSessionType;
  title: string;
  description?: string;
  targetDurationSec?: number;
  targetDistanceMeters?: number;
  primaryZone?: number;
  blocks: AiSessionBlock[];
};

export type AiSession = {
  // 1 = Montag … 7 = Sonntag (ISO-Konvention).
  dayOfWeek: number;
  // 1 = primäre Einheit, 2 = ggf. Double-Day (z.B. AM/PM).
  dayOrder?: number;
  sessionType: TrainingPlanSessionType;
  title: string;
  description?: string;
  targetDurationSec?: number;
  targetDistanceMeters?: number;
  // Dominante Pace-Zone (1..5). Detail in Blocks.
  primaryZone?: number;
  blocks: AiSessionBlock[];
  // Optionale Alternative ("Option 2" aus Referenzplan). Wird als eigene
  // Session-Zeile mit alternativeOfId in die DB geschrieben.
  alternative?: AiSessionAlternative;
};

export type AiWeek = {
  weekNumber: number;
  sessions: AiSession[];
};

export type AiChunkOutput = {
  weeks: AiWeek[];
};

// ============================================================
// JSON-Schema für das Tool (Claude Tool-Use)
// ============================================================
// Schema bewusst restriktiv: enums für Zonen + Session-Typen + Segment-Kinds,
// damit die KI keine Freitext-Varianten erfindet.

const segmentSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["warmup", "work", "recovery", "cooldown"],
      description: "Art des Segments innerhalb einer Block-Wiederholung.",
    },
    durationSec: {
      type: "integer",
      minimum: 0,
      description: "Dauer in Sekunden. Mindestens einer von durationSec oder distanceMeters muss gesetzt sein.",
    },
    distanceMeters: {
      type: "number",
      minimum: 0,
      description: "Distanz in Metern (Alternative zu durationSec).",
    },
    zone: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description: "Fixe Pace-Zone (1-5). Alternativ zoneMin+zoneMax für Range.",
    },
    zoneMin: { type: "integer", minimum: 1, maximum: 5 },
    zoneMax: { type: "integer", minimum: 1, maximum: 5 },
    paceMinSec: { type: "integer", minimum: 0, description: "Schnellere Pace-Grenze (Sekunden pro km)." },
    paceMaxSec: { type: "integer", minimum: 0, description: "Langsamere Pace-Grenze (Sekunden pro km)." },
    hrMin: { type: "integer", minimum: 0, description: "Untere HF-Grenze (bpm)." },
    hrMax: { type: "integer", minimum: 0, description: "Obere HF-Grenze (bpm)." },
    description: { type: "string" },
  },
  required: ["kind"],
};

const blockSchema = {
  type: "object",
  properties: {
    blockOrder: {
      type: "integer",
      minimum: 1,
      description: "Reihenfolge des Blocks innerhalb der Session (1..n).",
    },
    repetitions: {
      type: "integer",
      minimum: 1,
      description: "Wie oft das Segment-Muster wiederholt wird (z.B. 3 für '3×12min').",
    },
    description: { type: "string" },
    segments: {
      type: "array",
      minItems: 1,
      items: segmentSchema,
      description: "Sub-Segmente einer Block-Wiederholung (work + recovery für Intervalle).",
    },
  },
  required: ["blockOrder", "repetitions", "segments"],
};

const SESSION_TYPE_ENUM = [
  "recovery",
  "easy",
  "long",
  "tempo",
  "threshold",
  "intervals",
  "hills",
  "race_simulation",
  "strides",
  "progression",
  "criss_cross",
  "race",
  "rest",
] as const;

const sessionCommonProps = {
  sessionType: {
    type: "string",
    enum: SESSION_TYPE_ENUM,
  },
  title: {
    type: "string",
    description: "Kurztitel z.B. '3×12 min Zone 3' oder 'Long Run mit Marathon-Pace-Endabschnitt'.",
  },
  description: {
    type: "string",
    description: "Freitext-Beschreibung der Einheit (1-3 Sätze).",
  },
  targetDurationSec: {
    type: "integer",
    minimum: 0,
    description: "Gesamtdauer der Session in Sekunden (Summe über alle Blocks).",
  },
  targetDistanceMeters: {
    type: "number",
    minimum: 0,
    description: "Gesamtdistanz, falls relevant (z.B. Long Run).",
  },
  primaryZone: {
    type: "integer",
    minimum: 1,
    maximum: 5,
    description: "Dominante Pace-Zone der Session.",
  },
  blocks: {
    type: "array",
    minItems: 1,
    items: blockSchema,
  },
};

export const CREATE_TRAINING_CHUNK_TOOL: Anthropic.Tool = {
  name: "create_training_chunk",
  description:
    "Erstellt die strukturierten Trainingseinheiten für eine Plan-Phase " +
    "(typischerweise 4 Wochen). Jede Woche bekommt mehrere Sessions, " +
    "jede Session strukturierte Intervall-Blocks mit Pace-/HF-Targets. " +
    "Optional kann pro Session eine Alternative ('Option 2') angegeben werden.",
  input_schema: {
    type: "object",
    properties: {
      weeks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            weekNumber: {
              type: "integer",
              minimum: 1,
              description: "Globale Wochennummer im Gesamtplan (1..totalWeeks).",
            },
            sessions: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  dayOfWeek: {
                    type: "integer",
                    minimum: 1,
                    maximum: 7,
                    description: "1=Montag, 7=Sonntag.",
                  },
                  dayOrder: {
                    type: "integer",
                    minimum: 1,
                    description: "1=Haupteinheit, 2=Double-Day (selten).",
                  },
                  ...sessionCommonProps,
                  alternative: {
                    type: "object",
                    description:
                      "Optionale Alternative der Session ('Option 2'). " +
                      "Wird im Detail-View als Wechsel-Option angeboten.",
                    properties: sessionCommonProps,
                    required: ["sessionType", "title", "blocks"],
                  },
                },
                required: ["dayOfWeek", "sessionType", "title", "blocks"],
              },
            },
          },
          required: ["weekNumber", "sessions"],
        },
      },
    },
    required: ["weeks"],
  },
};
