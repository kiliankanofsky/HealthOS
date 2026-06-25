"use server";

import { revalidatePath } from "next/cache";

import {
  addTemplateExercise,
  createExercise,
  createSession as dbCreateSession,
  createTemplate,
  deleteSession as dbDeleteSession,
  deleteSessionExerciseOverride,
  deleteSet as dbDeleteSet,
  deleteTemplate,
  getExerciseByName,
  getManageableTemplates,
  getMaxTemplatePosition,
  getSession,
  getSessionById,
  getSessionsByTemplate,
  getSetById,
  getTemplateBySlug,
  removeTemplateExercise,
  reorderTemplateExercises,
  updateTemplateExerciseSets,
  updateSessionNotes,
  updateSetWeightMode,
  updateTemplate,
  upsertSessionExerciseOverride,
  upsertSet,
} from "@/lib/db/queries";
import { weightModes, type WeightMode } from "@/lib/db/schema";
import { PALETTE_KEYS } from "@/lib/hypertrophy/workouts";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Marker-Buchstabe aus dem Namen (erstes Alphanumerisches, groß).
function letterFromName(name: string): string {
  const m = name.match(/[a-z0-9]/i);
  return (m?.[0] ?? "?").toUpperCase();
}

// Rep-Range validieren (1–100, min ≤ max).
function validRepRange(min: number, max: number): boolean {
  return (
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= 1 &&
    max <= 100 &&
    min <= max
  );
}

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
  const template = await getTemplateBySlug(input.templateSlug);
  if (!template) return { ok: false, error: "Workout nicht gefunden." };

  const existing = await getSession(template.id, input.date);
  if (existing) {
    // Idempotent: wenn schon eine Session existiert, einfach diese zurückgeben.
    return { ok: true, date: existing.date, templateSlug: input.templateSlug };
  }

  const created = await dbCreateSession({
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
  const s = await getSessionById(input.sessionId);
  if (!s) return { ok: false, error: "Session nicht gefunden." };
  await dbDeleteSession(input.sessionId);
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function setSessionNotes(input: {
  sessionId: number;
  notes: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const s = await getSessionById(input.sessionId);
  if (!s) return { ok: false, error: "Session nicht gefunden." };
  const cleaned =
    input.notes === null
      ? null
      : input.notes.trim().length > 0
        ? input.notes.trim()
        : null;
  await updateSessionNotes(input.sessionId, cleaned);
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
  const session = await getSessionById(input.sessionId);
  if (!session) return { ok: false, error: "Session nicht gefunden." };

  await upsertSet({
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
  const set = await getSetById(input.setId);
  if (!set) return { ok: false, error: "Satz nicht gefunden." };
  const next: WeightMode = set.weightMode === "summed" ? "per-side" : "summed";
  await updateSetWeightMode(input.setId, next);
  revalidatePath("/hypertrophy");
  return { ok: true, mode: next };
}

export async function deleteSet(input: {
  setId: number;
}): Promise<{ ok: boolean }> {
  if (!Number.isFinite(input.setId)) return { ok: false };
  await dbDeleteSet(input.setId);
  revalidatePath("/hypertrophy");
  return { ok: true };
}

// ---- Exercise-Overrides (alternative Übung pro Slot pro Session) ----

export async function saveExerciseOverride(input: {
  sessionId: number;
  templateExerciseId: number;
  name: string;
}): Promise<{ ok: boolean; error?: string }> {
  const trimmed = input.name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Name darf nicht leer sein." };
  }
  if (trimmed.length > 80) {
    return { ok: false, error: "Name max. 80 Zeichen." };
  }
  const session = await getSessionById(input.sessionId);
  if (!session) return { ok: false, error: "Session nicht gefunden." };
  await upsertSessionExerciseOverride({
    sessionId: input.sessionId,
    templateExerciseId: input.templateExerciseId,
    name: trimmed,
  });
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function clearExerciseOverride(input: {
  sessionId: number;
  templateExerciseId: number;
}): Promise<{ ok: boolean }> {
  await deleteSessionExerciseOverride(input.sessionId, input.templateExerciseId);
  revalidatePath("/hypertrophy");
  return { ok: true };
}

// ============================================================
// Trainingseinheiten (Templates): Erstellen, Rotation, Verwaltung
// ============================================================

export type UnitExerciseInput = {
  // Übungs-Name (aus dem Katalog gewählt ODER neu) + Ziel-Rep-Range.
  name: string;
  repMin: number;
  repMax: number;
  unilateral?: boolean;
  // Vorgeschlagene Satz-Anzahl (Logger befüllt so viele Zeilen vor).
  defaultSets?: number | null;
};

// Satz-Anzahl normalisieren: ganzzahlig, 1–20, sonst null (= Default 3).
function normalizeSets(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 20) return null;
  return n;
}

export type CreateUnitResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

// Neue Trainingseinheit anlegen: Template + Slots. Unbekannte Übungs-Namen
// werden als neue Stamm-Übungen erstellt (identische Behandlung wie Bestehende).
export async function createTrainingUnit(input: {
  name: string;
  color?: string | null;
  exercises: UnitExerciseInput[];
}): Promise<CreateUnitResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name darf nicht leer sein." };
  if (name.length > 60) return { ok: false, error: "Name max. 60 Zeichen." };
  const exercises = input.exercises.filter((e) => e.name.trim().length > 0);
  if (exercises.length === 0)
    return { ok: false, error: "Mindestens eine Übung wählen." };
  for (const e of exercises) {
    if (!validRepRange(e.repMin, e.repMax))
      return { ok: false, error: `Ungültige Rep-Range bei „${e.name}".` };
  }

  const existing = await getManageableTemplates();
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1);
  // Farbe: gewählt, sonst nächste freie Palette-Farbe.
  const used = new Set(
    existing.map((t) => t.color).filter((c): c is string => !!c),
  );
  const color =
    (input.color && PALETTE_KEYS.includes(input.color) ? input.color : null) ??
    PALETTE_KEYS.find((k) => !used.has(k)) ??
    PALETTE_KEYS[existing.length % PALETTE_KEYS.length];

  const tpl = await createTemplate({
    name,
    color,
    letter: letterFromName(name),
    inRotation: true,
    sortOrder: maxSort + 1,
  });

  // Slots in Reihenfolge; doppelte Übungen (gleiche Stamm-Übung) überspringen
  // (UNIQUE(template, exercise)).
  let pos = 1;
  const seen = new Set<number>();
  for (const ex of exercises) {
    const exName = ex.name.trim();
    let exercise = await getExerciseByName(exName);
    if (!exercise) {
      exercise = await createExercise({
        name: exName,
        defaultRepMin: ex.repMin,
        defaultRepMax: ex.repMax,
        unilateral: ex.unilateral ?? false,
      });
    }
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    await addTemplateExercise({
      templateId: tpl.id,
      exerciseId: exercise.id,
      position: pos++,
      repMin: ex.repMin,
      repMax: ex.repMax,
      defaultSets: normalizeSets(ex.defaultSets),
    });
  }

  revalidatePath("/hypertrophy");
  return { ok: true, slug: tpl.slug };
}

export async function setUnitInRotation(input: {
  templateId: number;
  inRotation: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const row = await updateTemplate(input.templateId, {
    inRotation: input.inRotation,
  });
  if (!row) return { ok: false, error: "Einheit nicht gefunden." };
  revalidatePath("/hypertrophy");
  return { ok: true };
}

// Reihenfolge der Rotation festlegen (sortOrder = Index).
export async function reorderRotation(input: {
  orderedTemplateIds: number[];
}): Promise<{ ok: boolean }> {
  for (let i = 0; i < input.orderedTemplateIds.length; i++) {
    await updateTemplate(input.orderedTemplateIds[i], { sortOrder: i });
  }
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function updateTrainingUnit(input: {
  templateId: number;
  name?: string;
  color?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const patch: { name?: string; color?: string | null; letter?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name darf nicht leer sein." };
    if (name.length > 60) return { ok: false, error: "Name max. 60 Zeichen." };
    patch.name = name;
    patch.letter = letterFromName(name);
  }
  if (input.color !== undefined) {
    if (input.color !== null && !PALETTE_KEYS.includes(input.color))
      return { ok: false, error: "Unbekannte Farbe." };
    patch.color = input.color;
  }
  const row = await updateTemplate(input.templateId, patch);
  if (!row) return { ok: false, error: "Einheit nicht gefunden." };
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export type AddExerciseResult =
  | {
      ok: true;
      slot: {
        templateExerciseId: number;
        name: string;
        slug: string;
        repMin: number;
        repMax: number;
        defaultSets: number | null;
      };
    }
  | { ok: false; error: string };

export async function addExerciseToUnit(input: {
  templateId: number;
  name: string;
  repMin: number;
  repMax: number;
  unilateral?: boolean;
  defaultSets?: number | null;
}): Promise<AddExerciseResult> {
  const exName = input.name.trim();
  if (!exName) return { ok: false, error: "Name darf nicht leer sein." };
  if (!validRepRange(input.repMin, input.repMax))
    return { ok: false, error: "Ungültige Rep-Range." };
  const defaultSets = normalizeSets(input.defaultSets);
  let exercise = await getExerciseByName(exName);
  if (!exercise) {
    exercise = await createExercise({
      name: exName,
      defaultRepMin: input.repMin,
      defaultRepMax: input.repMax,
      unilateral: input.unilateral ?? false,
    });
  }
  const position = (await getMaxTemplatePosition(input.templateId)) + 1;
  let slot;
  try {
    slot = await addTemplateExercise({
      templateId: input.templateId,
      exerciseId: exercise.id,
      position,
      repMin: input.repMin,
      repMax: input.repMax,
      defaultSets,
    });
  } catch {
    return { ok: false, error: "Übung ist bereits in dieser Einheit." };
  }
  revalidatePath("/hypertrophy");
  return {
    ok: true,
    slot: {
      templateExerciseId: slot.id,
      name: exercise.name,
      slug: exercise.slug,
      repMin: input.repMin,
      repMax: input.repMax,
      defaultSets,
    },
  };
}

// Satz-Vorgabe eines bestehenden Slots ändern (Edit bestehender Einheit).
// null = zurück auf Default (3).
export async function setExerciseDefaultSets(input: {
  templateExerciseId: number;
  defaultSets: number | null;
}): Promise<{ ok: boolean }> {
  await updateTemplateExerciseSets(
    input.templateExerciseId,
    normalizeSets(input.defaultSets),
  );
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function removeExerciseFromUnit(input: {
  templateExerciseId: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await removeTemplateExercise(input.templateExerciseId);
  } catch {
    // FK RESTRICT: Slot hat geloggte Sätze.
    return {
      ok: false,
      error: "Übung hat bereits geloggte Sätze und kann nicht entfernt werden.",
    };
  }
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function reorderUnitExercises(input: {
  orderedTemplateExerciseIds: number[];
}): Promise<{ ok: boolean }> {
  await reorderTemplateExercises(input.orderedTemplateExerciseIds);
  revalidatePath("/hypertrophy");
  return { ok: true };
}

// Einheit löschen: hat sie Sessions → archivieren (Historie bleibt indiziert),
// sonst hart löschen (Slots cascaden, da keine Sätze existieren).
export async function deleteTrainingUnit(input: {
  templateId: number;
}): Promise<{ ok: boolean; archived: boolean; error?: string }> {
  const sessions = await getSessionsByTemplate(input.templateId);
  if (sessions.length > 0) {
    const row = await updateTemplate(input.templateId, {
      archived: true,
      inRotation: false,
    });
    if (!row)
      return { ok: false, archived: false, error: "Einheit nicht gefunden." };
    revalidatePath("/hypertrophy");
    return { ok: true, archived: true };
  }
  await deleteTemplate(input.templateId);
  revalidatePath("/hypertrophy");
  return { ok: true, archived: false };
}
