"use server";

import { revalidatePath } from "next/cache";
import {
  deletePhase,
  deleteWeightEntry,
  deleteWeightEntryByDate,
  updateWeightMetadata,
  upsertPhase,
  upsertWeightEntry,
} from "@/lib/db/queries";
import {
  type PhaseKind,
  phaseKinds,
  weightSources,
  type WeightSource,
} from "@/lib/db/schema";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type AddEntryState = {
  ok: boolean;
  error?: string;
};

// Server Action: legt einen Eintrag an oder überschreibt einen bestehenden für dasselbe Datum.
export async function addWeightEntry(
  _prev: AddEntryState | undefined,
  formData: FormData,
): Promise<AddEntryState> {
  const date = String(formData.get("date") ?? "").trim();
  const weightRaw = String(formData.get("weight") ?? "").replace(",", ".").trim();
  const notesRaw = String(formData.get("notes") ?? "").trim();

  if (!DATE_REGEX.test(date)) {
    return { ok: false, error: "Datum muss im Format YYYY-MM-DD sein." };
  }

  const weight = Number(weightRaw);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
    return { ok: false, error: "Gewicht muss eine Zahl zwischen 0 und 500 kg sein." };
  }

  upsertWeightEntry({
    date,
    weightKg: Math.round(weight * 100) / 100,
    source: "manual",
    notes: notesRaw.length > 0 ? notesRaw : null,
  });

  revalidatePath("/weight");
  revalidatePath("/weight/entries");
  return { ok: true };
}

export async function removeWeightEntry(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  deleteWeightEntry(id);
  revalidatePath("/weight");
  revalidatePath("/weight/entries");
}

// Direkter Setter für Inline-Editing aus Client-Komponenten.
// weightKg = null → bestehenden Eintrag des Tages löschen.
export async function setWeightForDate(
  date: string,
  weightKg: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!DATE_REGEX.test(date)) {
    return { ok: false, error: "Ungültiges Datum." };
  }

  if (weightKg === null) {
    deleteWeightEntryByDate(date);
  } else {
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
      return { ok: false, error: "Gewicht außerhalb des gültigen Bereichs." };
    }
    upsertWeightEntry({
      date,
      weightKg: Math.round(weightKg * 100) / 100,
      source: "manual",
      notes: null,
    });
  }

  revalidatePath("/weight");
  revalidatePath("/weight/entries");
  return { ok: true };
}

// Aktualisiert Tagesdetails (Quelle, Cheat-Day, Alkohol, Notizen).
// Wenn der Eintrag noch nicht existiert, wird er angelegt — Gewicht muss
// dann mitgegeben werden.
export type DayDetailsInput = {
  date: string;
  weightKg?: number | null;
  source?: WeightSource;
  cheatDay?: boolean;
  alcohol?: boolean;
  cheatMeal?: boolean;
  kcalTarget?: number | null;
  notes?: string | null;
};

export async function updateDayDetails(
  input: DayDetailsInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!DATE_REGEX.test(input.date)) {
    return { ok: false, error: "Ungültiges Datum." };
  }
  if (input.source && !weightSources.includes(input.source)) {
    return { ok: false, error: "Ungültige Quelle." };
  }

  const cleanNotes =
    input.notes === undefined
      ? undefined
      : input.notes === null
        ? null
        : input.notes.trim().length > 0
          ? input.notes.trim()
          : null;

  if (input.weightKg !== undefined && input.weightKg !== null) {
    if (!Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > 500) {
      return { ok: false, error: "Gewicht außerhalb des gültigen Bereichs." };
    }
    upsertWeightEntry({
      date: input.date,
      weightKg: Math.round(input.weightKg * 100) / 100,
      source: input.source ?? "manual",
      notes: cleanNotes ?? null,
      cheatDay: input.cheatDay ?? false,
      alcohol: input.alcohol ?? false,
      cheatMeal: input.cheatMeal ?? false,
      kcalTarget: input.kcalTarget ?? null,
    });
  } else {
    const updated = updateWeightMetadata(input.date, {
      ...(input.source !== undefined && { source: input.source }),
      ...(input.cheatDay !== undefined && { cheatDay: input.cheatDay }),
      ...(input.alcohol !== undefined && { alcohol: input.alcohol }),
      ...(input.cheatMeal !== undefined && { cheatMeal: input.cheatMeal }),
      ...(input.kcalTarget !== undefined && { kcalTarget: input.kcalTarget }),
      ...(cleanNotes !== undefined && { notes: cleanNotes }),
    });
    if (!updated) {
      return { ok: false, error: "Kein Eintrag für dieses Datum vorhanden." };
    }
  }

  revalidatePath("/weight");
  revalidatePath("/weight/entries");
  return { ok: true };
}

// ---- Phasen ----

export type PhaseInput = {
  id?: number;
  kind: PhaseKind;
  startDate: string;
  endDate?: string | null;
  label?: string | null;
};

export async function savePhase(
  input: PhaseInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!phaseKinds.includes(input.kind)) {
    return { ok: false, error: "Ungültige Phasen-Art." };
  }
  if (!DATE_REGEX.test(input.startDate)) {
    return { ok: false, error: "Startdatum ungültig." };
  }
  if (input.endDate && !DATE_REGEX.test(input.endDate)) {
    return { ok: false, error: "Enddatum ungültig." };
  }
  if (input.endDate && input.endDate < input.startDate) {
    return { ok: false, error: "Enddatum liegt vor dem Startdatum." };
  }

  upsertPhase({
    kind: input.kind,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    label: input.label?.trim() && input.label.trim().length > 0 ? input.label.trim() : null,
    source: "manual",
  });

  revalidatePath("/weight");
  return { ok: true };
}

export async function removePhase(id: number): Promise<{ ok: boolean }> {
  if (!Number.isFinite(id)) return { ok: false };
  deletePhase(id);
  revalidatePath("/weight");
  return { ok: true };
}
