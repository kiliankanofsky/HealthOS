"use server";

import { revalidatePath } from "next/cache";

import {
  createSession as dbCreateSession,
  deleteSession as dbDeleteSession,
  deleteSet as dbDeleteSet,
  getSession,
  getSessionById,
  getSetById,
  getTemplateBySlug,
  updateSessionNotes,
  updateSetWeightMode,
  upsertSet,
} from "@/lib/db/queries";
import { weightModes, type WeightMode } from "@/lib/db/schema";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ---- Sessions ----

export type CreateSessionResult =
  | { ok: true; date: string; templateSlug: string }
  | { ok: false; error: string };

export async function createSession(input: {
  templateSlug: string;
  date: string;
  notes?: string | null;
}): Promise<CreateSessionResult> {
  if (!DATE_REGEX.test(input.date)) {
    return { ok: false, error: "Datum muss YYYY-MM-DD sein." };
  }
  const template = getTemplateBySlug(input.templateSlug);
  if (!template) return { ok: false, error: "Workout nicht gefunden." };

  const existing = getSession(template.id, input.date);
  if (existing) {
    // Idempotent: wenn schon eine Session existiert, einfach diese zurückgeben.
    return { ok: true, date: existing.date, templateSlug: input.templateSlug };
  }

  const created = dbCreateSession({
    templateId: template.id,
    date: input.date,
    notes: input.notes ?? null,
    source: "manual",
  });

  revalidatePath("/hypertrophy");
  revalidatePath(`/hypertrophy/${input.templateSlug}`);
  revalidatePath(`/hypertrophy/${input.templateSlug}/${input.date}`);
  return { ok: true, date: created.date, templateSlug: input.templateSlug };
}

export async function deleteSession(input: {
  sessionId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const s = getSessionById(input.sessionId);
  if (!s) return { ok: false, error: "Session nicht gefunden." };
  dbDeleteSession(input.sessionId);
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function setSessionNotes(input: {
  sessionId: number;
  notes: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const s = getSessionById(input.sessionId);
  if (!s) return { ok: false, error: "Session nicht gefunden." };
  const cleaned =
    input.notes === null
      ? null
      : input.notes.trim().length > 0
        ? input.notes.trim()
        : null;
  updateSessionNotes(input.sessionId, cleaned);
  revalidatePath("/hypertrophy");
  return { ok: true };
}

// ---- Sets ----

export type UpsertSetInput = {
  sessionId: number;
  templateExerciseId: number;
  setNumber: number;
  weightKg: number;
  reps: number;
  weightMode?: WeightMode;
};

export async function saveSet(
  input: UpsertSetInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(input.weightKg) || input.weightKg < 0 || input.weightKg > 1000) {
    return { ok: false, error: "Gewicht 0–1000 kg." };
  }
  if (!Number.isInteger(input.reps) || input.reps < 0 || input.reps > 100) {
    return { ok: false, error: "Reps 0–100." };
  }
  if (!Number.isInteger(input.setNumber) || input.setNumber < 1) {
    return { ok: false, error: "Satz-Nummer ungültig." };
  }
  if (input.weightMode && !weightModes.includes(input.weightMode)) {
    return { ok: false, error: "Ungültiger Weight-Mode." };
  }
  const session = getSessionById(input.sessionId);
  if (!session) return { ok: false, error: "Session nicht gefunden." };

  upsertSet({
    sessionId: input.sessionId,
    templateExerciseId: input.templateExerciseId,
    setNumber: input.setNumber,
    weightKg: Math.round(input.weightKg * 100) / 100,
    reps: input.reps,
    weightMode: input.weightMode ?? "per-side",
  });

  revalidatePath("/hypertrophy");
  return { ok: true };
}

// Schaltet den Weight-Mode eines existierenden Sets um (P ↔ S).
// Wirkt nur auf den Score, das geloggte Gewicht bleibt wie es ist.
export async function toggleSetWeightMode(input: {
  setId: number;
}): Promise<{ ok: boolean; mode?: WeightMode; error?: string }> {
  const set = getSetById(input.setId);
  if (!set) return { ok: false, error: "Satz nicht gefunden." };
  const next: WeightMode = set.weightMode === "summed" ? "per-side" : "summed";
  updateSetWeightMode(input.setId, next);
  revalidatePath("/hypertrophy");
  return { ok: true, mode: next };
}

export async function deleteSet(input: {
  setId: number;
}): Promise<{ ok: boolean }> {
  if (!Number.isFinite(input.setId)) return { ok: false };
  dbDeleteSet(input.setId);
  revalidatePath("/hypertrophy");
  return { ok: true };
}
