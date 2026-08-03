"use server";

import { revalidatePath } from "next/cache";
import {
  deleteDailyTag,
  deletePhase,
  deleteWeightEntry,
  deleteWeightEntryByDate,
  getAllPhases,
  getWeightEntryByDate,
  updatePhase,
  updateWeightMetadata,
  upsertDailyTag,
  upsertPhase,
  upsertWeightEntry,
} from "@/lib/db/queries";
import {
  type PhaseKind,
  phaseKinds,
  weightSources,
  type WeightSource,
} from "@/lib/db/schema";
import { DEMO_BLOCKED_MESSAGE, isDemo } from "@/lib/demo/guard";
import {
  runAllSyncs,
  type SyncResult,
  type SyncSummary,
} from "@/lib/integrations/sync-all";

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

  await upsertWeightEntry({
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
  await deleteWeightEntry(id);
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
    await deleteWeightEntryByDate(date);
  } else {
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
      return { ok: false, error: "Gewicht außerhalb des gültigen Bereichs." };
    }
    await upsertWeightEntry({
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

  // Gewicht und Notiz wandern in weight_entries — Tags in daily_tags.
  if (input.weightKg !== undefined && input.weightKg !== null) {
    if (!Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > 500) {
      return { ok: false, error: "Gewicht außerhalb des gültigen Bereichs." };
    }
    await upsertWeightEntry({
      date: input.date,
      weightKg: Math.round(input.weightKg * 100) / 100,
      source: input.source ?? "manual",
      notes: cleanNotes ?? null,
    });
  } else if (
    input.source !== undefined ||
    cleanNotes !== undefined
  ) {
    // Nur Notiz/Quelle ändern — Eintrag muss existieren.
    const exists = await getWeightEntryByDate(input.date);
    if (!exists) {
      // Wenn nur Tags geändert werden, ist das OK (siehe upsert unten).
      // Wenn jedoch Quelle/Notiz geändert werden soll und kein Eintrag
      // existiert, abbrechen.
      if (input.source !== undefined || cleanNotes !== undefined) {
        return { ok: false, error: "Kein Weight-Eintrag für dieses Datum." };
      }
    } else {
      await updateWeightMetadata(input.date, {
        ...(input.source !== undefined && { source: input.source }),
        ...(cleanNotes !== undefined && { notes: cleanNotes }),
      });
    }
  }

  // Tag-Felder immer in daily_tags persistieren (auch ohne Weight-Eintrag).
  if (
    input.cheatDay !== undefined ||
    input.alcohol !== undefined ||
    input.cheatMeal !== undefined ||
    input.kcalTarget !== undefined
  ) {
    await upsertDailyTag({
      date: input.date,
      ...(input.cheatDay !== undefined && { cheatDay: input.cheatDay }),
      ...(input.alcohol !== undefined && { alcohol: input.alcohol }),
      ...(input.cheatMeal !== undefined && { cheatMeal: input.cheatMeal }),
      ...(input.kcalTarget !== undefined && { kcalTarget: input.kcalTarget }),
    });
  }

  revalidatePath("/weight");
  revalidatePath("/weight/entries");
  revalidatePath("/weight/tags");
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

  const label =
    input.label?.trim() && input.label.trim().length > 0 ? input.label.trim() : null;
  const endDate = input.endDate ?? null;

  if (input.id != null) {
    // Bestehende Phase bearbeiten → echtes Update über die id, damit auch das
    // Startdatum geändert werden kann, ohne (wie beim Upsert-über-startDate)
    // eine Dublette anzulegen.
    const allPhases = await getAllPhases();
    const existing = allPhases.find((p) => p.id === input.id);
    if (!existing) {
      return { ok: false, error: "Phase nicht gefunden." };
    }
    // Wenn das neue Startdatum mit einer ANDEREN Phase kollidiert (UNIQUE auf
    // start_date), brechen wir mit klarer Meldung ab.
    if (
      input.startDate !== existing.startDate &&
      allPhases.some((p) => p.id !== input.id && p.startDate === input.startDate)
    ) {
      return { ok: false, error: "Für dieses Startdatum existiert bereits eine Phase." };
    }
    await updatePhase(input.id, {
      kind: input.kind,
      startDate: input.startDate,
      endDate,
      label,
      source: "manual",
    });
  } else {
    await upsertPhase({
      kind: input.kind,
      startDate: input.startDate,
      endDate,
      label,
      source: "manual",
    });
  }

  revalidatePath("/weight");
  return { ok: true };
}

export async function removePhase(id: number): Promise<{ ok: boolean }> {
  if (!Number.isFinite(id)) return { ok: false };
  await deletePhase(id);
  revalidatePath("/weight");
  return { ok: true };
}

// Server Action für den "Sync"-Button auf den Modul-Seiten.
// Ruft denselben Code wie der tägliche Cron, gibt die Summary zurück und
// invalidiert den Seiten-Cache, damit frische Daten gerendert werden.
export async function syncNow(): Promise<SyncSummary> {
  // Der Sync benutzt echte Garmin-/FDDB-/Sheets-Zugangsdaten — im
  // öffentlichen Demo-Modus tabu (der Button wird dort ohnehin nicht
  // gerendert, siehe components/site/SyncNowSlot.tsx).
  if (await isDemo()) {
    const blocked: SyncResult = { ok: false, error: DEMO_BLOCKED_MESSAGE };
    return {
      ok: false,
      ranAt: new Date().toISOString(),
      changes: [],
      results: {
        sheets: blocked,
        garminStrength: blocked,
        garminCalories: blocked,
        garminRuns: blocked,
        garminMetrics: blocked,
        planMatch: blocked,
        nutrition: blocked,
        nextSessionNote: blocked,
      },
    };
  }

  const summary = await runAllSyncs();
  revalidatePath("/weight");
  revalidatePath("/hypertrophy");
  return summary;
}

// ---- Daily Tags (cheatDay / alcohol / cheatMeal / kcalTarget) ----

export type DailyTagInput = {
  date: string;
  cheatDay?: boolean;
  alcohol?: boolean;
  cheatMeal?: boolean;
  kcalTarget?: number | null;
  notes?: string | null;
};

export async function saveDailyTag(
  input: DailyTagInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!DATE_REGEX.test(input.date)) {
    return { ok: false, error: "Ungültiges Datum." };
  }
  if (
    input.kcalTarget !== undefined &&
    input.kcalTarget !== null &&
    (!Number.isFinite(input.kcalTarget) ||
      input.kcalTarget < 0 ||
      input.kcalTarget > 10000)
  ) {
    return { ok: false, error: "Kalorienziel muss 0–10.000 sein." };
  }

  await upsertDailyTag({
    date: input.date,
    ...(input.cheatDay !== undefined && { cheatDay: input.cheatDay }),
    ...(input.alcohol !== undefined && { alcohol: input.alcohol }),
    ...(input.cheatMeal !== undefined && { cheatMeal: input.cheatMeal }),
    ...(input.kcalTarget !== undefined && { kcalTarget: input.kcalTarget }),
    ...(input.notes !== undefined && { notes: input.notes }),
  });

  revalidatePath("/weight");
  revalidatePath("/weight/tags");
  revalidatePath("/weight/entries");
  revalidatePath("/endurance");
  revalidatePath("/hypertrophy");
  return { ok: true };
}

export async function removeDailyTag(
  date: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!DATE_REGEX.test(date)) {
    return { ok: false, error: "Ungültiges Datum." };
  }
  await deleteDailyTag(date);
  revalidatePath("/weight");
  revalidatePath("/weight/tags");
  revalidatePath("/weight/entries");
  revalidatePath("/endurance");
  revalidatePath("/hypertrophy");
  return { ok: true };
}
