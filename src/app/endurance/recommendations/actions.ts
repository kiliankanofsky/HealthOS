"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createPlanWeek,
  createTrainingPlan,
  getActiveTrainingPlan,
  setTrainingPlanStatus,
} from "@/lib/db/queries";
import {
  computePlanWeeks,
  derivePaceZones,
  parseHmsToSeconds,
  type PaceZones,
} from "@/lib/endurance/plan";
import { extractPdfText } from "@/lib/endurance/pdf-extract";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// Cap, damit kein riesiges PDF die DB sprengt. ~500k Zeichen ≈ 100+ Seiten Text,
// genug für Marathon-Pläne mit Begleittext.
const PDF_TEXT_MAX_CHARS = 500_000;

export type CreatePlanState = {
  ok: boolean;
  error?: string;
};

function num(value: FormDataEntryValue | null): number | undefined {
  if (value === null) return undefined;
  const str = String(value).replace(",", ".").trim();
  if (str === "") return undefined;
  const n = Number(str);
  return Number.isFinite(n) ? n : undefined;
}

// Liest die fünf Pace-Zonen aus dem Form (jede Zone hat min/max). Liefert
// undefined, wenn nichts gesetzt ist — dann wird auto-derived.
function readPaceZonesFromForm(formData: FormData): PaceZones | undefined {
  const get = (key: string) => num(formData.get(key));
  const zones = {
    z1: { minSec: get("z1Min"), maxSec: get("z1Max") },
    z2: { minSec: get("z2Min"), maxSec: get("z2Max") },
    z3: { minSec: get("z3Min"), maxSec: get("z3Max") },
    z4: { minSec: get("z4Min"), maxSec: get("z4Max") },
    z5: { minSec: get("z5Min"), maxSec: get("z5Max") },
  };
  const allSet = Object.values(zones).every(
    (z) => z.minSec !== undefined && z.maxSec !== undefined,
  );
  if (!allSet) return undefined;
  return zones as PaceZones;
}

export async function createPlanFromSettings(
  _prev: CreatePlanState | undefined,
  formData: FormData,
): Promise<CreatePlanState> {
  // ---- Validate ----
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) return { ok: false, error: "Plan-Name fehlt." };

  const raceName = String(formData.get("raceName") ?? "").trim() || null;
  const raceDate = String(formData.get("raceDate") ?? "").trim();
  if (!DATE_REGEX.test(raceDate)) {
    return { ok: false, error: "Race-Datum muss YYYY-MM-DD sein." };
  }

  const raceDistanceKm = num(formData.get("raceDistanceKm"));
  if (raceDistanceKm === undefined || raceDistanceKm <= 0) {
    return { ok: false, error: "Race-Distanz fehlt oder ungültig." };
  }

  const targetTimeRaw = String(formData.get("targetTime") ?? "").trim();
  let targetTimeSeconds: number;
  try {
    targetTimeSeconds = parseHmsToSeconds(targetTimeRaw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (targetTimeSeconds <= 0) {
    return { ok: false, error: "Zielzeit muss > 0 sein." };
  }

  const targetPaceSecPerKm = targetTimeSeconds / raceDistanceKm;

  const targetWeeklyKmPeak = num(formData.get("targetWeeklyKmPeak")) ?? null;
  const sessionsPerWeek = num(formData.get("sessionsPerWeek")) ?? null;

  const totalWeeks = num(formData.get("totalWeeks"));
  if (totalWeeks === undefined || totalWeeks < 1 || totalWeeks > 52) {
    return { ok: false, error: "Anzahl Wochen muss zwischen 1 und 52 liegen." };
  }
  const totalWeeksInt = Math.round(totalWeeks);

  // Pace-Zonen: aus Form lesen, sonst auto-derived.
  const paceZones = readPaceZonesFromForm(formData) ?? derivePaceZones(targetPaceSecPerKm);

  // ---- Wochen vorab berechnen (Race-Datum rückwärts) ----
  let computed: ReturnType<typeof computePlanWeeks>;
  try {
    computed = computePlanWeeks(raceDate, totalWeeksInt);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // ---- PDF-Text extrahieren (optional) ----
  const pdfFile = formData.get("pdf");
  let referencePdfText: string | null = null;
  let referencePdfName: string | null = null;
  if (pdfFile instanceof File && pdfFile.size > 0) {
    try {
      const text = await extractPdfText(pdfFile);
      referencePdfText =
        text.length > PDF_TEXT_MAX_CHARS ? text.slice(0, PDF_TEXT_MAX_CHARS) : text;
      referencePdfName = pdfFile.name;
    } catch (e) {
      return { ok: false, error: `PDF konnte nicht gelesen werden: ${(e as Error).message}` };
    }
  }

  // ---- Bestehenden aktiven Plan ggf. archivieren ----
  const existingActive = await getActiveTrainingPlan();
  if (existingActive) {
    await setTrainingPlanStatus(existingActive.id, "archived");
  }

  // ---- Plan + Wochen in DB schreiben ----
  const plan = await createTrainingPlan({
    name,
    goalType: "race",
    raceName,
    raceDate,
    raceDistanceKm,
    targetTimeSeconds,
    targetPaceSecPerKm,
    targetWeeklyKmPeak,
    sessionsPerWeek,
    planStartDate: computed.planStartDate,
    totalWeeks: totalWeeksInt,
    status: "draft",
    paceZonesJson: paceZones,
    referencePdfText,
    referencePdfName,
  });

  for (const w of computed.weeks) {
    await createPlanWeek({
      planId: plan.id,
      weekNumber: w.weekNumber,
      startDate: w.startDate,
      endDate: w.endDate,
      phase: w.phase,
    });
  }

  revalidatePath("/endurance/recommendations");
  revalidatePath("/endurance");
  redirect("/endurance/recommendations");
}
