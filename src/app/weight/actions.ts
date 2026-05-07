"use server";

import { revalidatePath } from "next/cache";
import { deleteWeightEntry, upsertWeightEntry } from "@/lib/db/queries";

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
    // Eintrag dieses Tages löschen, falls einer existiert.
    // Wir nutzen upsert nicht zum Löschen — stattdessen direkter Lookup + delete-by-id.
    const { db, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const existing = db
      .select()
      .from(schema.weightEntries)
      .where(eq(schema.weightEntries.date, date))
      .get();
    if (existing) {
      deleteWeightEntry(existing.id);
    }
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
