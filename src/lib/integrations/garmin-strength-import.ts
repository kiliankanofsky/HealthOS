import { GarminConnect } from "@gooin/garmin-connect";

import {
  buildExerciseAliasMap,
  createSession as dbCreateSession,
  getAllTemplates,
  getSessionByGarminId,
  getSetsBySession,
  getTemplateExercises,
  upsertSet,
} from "@/lib/db/queries";
import type { TemplateExerciseRow } from "@/lib/db/queries";
import type { WorkoutTemplate } from "@/lib/db/schema";

// ============================================================
// Garmin-Strength-Import.
// Holt strength_training-Aktivitäten, mappt Übungen über Aliases,
// ordnet die Einheit zu (Aktivitätsname = Einheitsname, sonst
// heuristisch anhand der Übungs-Composition) und upserts Sessions + Sätze.
// ============================================================

// Mindestmatch-Quote, damit ein Garmin-Workout einem Template zugeordnet wird.
const MATCH_THRESHOLD = 0.7;
// Mindestanzahl gemappter Übungen — verhindert "1/1 = 100 %"-False-Positives,
// wenn fast alle Übungen unbekannt sind und nur eine zufällig matcht.
const MIN_MATCHED_EXERCISES = 4;

type RawExerciseSet = {
  setType: string;
  startTime: string;
  duration?: number;
  repetitionCount?: number | null;
  weight?: number | null; // Gramm
  exercises?: Array<{
    category?: string | null;
    name?: string | null;
  }>;
};

type ExerciseSetsResponse = {
  exerciseSets?: RawExerciseSet[];
};

type GarminActivity = {
  activityId: number;
  activityName?: string | null;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
};

export type ImportLogEntry = {
  level: "info" | "warn" | "error";
  message: string;
};

export type ImportResult = {
  scanned: number;
  imported: number;
  skippedAlreadyImported: number;
  skippedUnassigned: number;
  skippedConflict: number;
  log: ImportLogEntry[];
};

export type ImportOptions = {
  client: GarminConnect;
  // Wie viele Aktivitäten Garmin maximal zurück liefert (alle Typen — wird
  // clientseitig auf strength_training gefiltert).
  fetchLimit?: number;
  // Wenn gesetzt, werden nur Aktivitäten mit startTimeLocal ≥ since importiert.
  since?: string; // YYYY-MM-DD
  // Wenn true: nichts in die DB schreiben, nur logging.
  dryRun?: boolean;
};

export async function syncGarminStrength(
  options: ImportOptions,
): Promise<ImportResult> {
  const { client, fetchLimit = 200, since, dryRun = false } = options;

  const log: ImportLogEntry[] = [];
  const result: ImportResult = {
    scanned: 0,
    imported: 0,
    skippedAlreadyImported: 0,
    skippedUnassigned: 0,
    skippedConflict: 0,
    log,
  };

  // Lookup-Daten aus DB einmal vorbereiten.
  const aliasMap = await buildExerciseAliasMap();
  const templates = await getAllTemplates();
  const templateExercisesByTemplate = new Map<number, TemplateExerciseRow[]>();
  for (const tpl of templates) {
    templateExercisesByTemplate.set(tpl.id, await getTemplateExercises(tpl.id));
  }
  // Archivierte Einheiten bekommen keine neuen Sessions mehr — sie bleiben nur
  // in der Map, damit der Backfill bestehender Sessions weiter funktioniert.
  const candidates = templates.filter((t) => !t.archived);

  // Aktivitäten holen.
  const all = (await client.getActivities(0, fetchLimit)) as GarminActivity[];
  const strengths = all.filter(
    (a) => a.activityType?.typeKey === "strength_training",
  );

  for (const act of strengths) {
    result.scanned += 1;
    const dateIso = (act.startTimeLocal ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      log.push({
        level: "warn",
        message: `Activity ${act.activityId}: ungültiges Datum "${act.startTimeLocal}" — übersprungen.`,
      });
      continue;
    }
    if (since && dateIso < since) continue;

    // Idempotenz mit Backfill: Statt eine bereits importierte Aktivität komplett
    // zu überspringen, prüfen wir, ob noch Slots LEER sind. Das passiert, wenn
    // ein früherer Sync die Garmin-Aktivität nur teilweise gesehen hat (Garmin
    // schreibt Sätze teils verzögert / nach Skip-Group erst nachträglich). Dann
    // tragen wir die leeren Slots aus Garmin nach — bestehende Sätze (manuell
    // wie importiert) bleiben unberührt.
    const existing = await getSessionByGarminId(act.activityId);
    if (existing) {
      const tplRows = templateExercisesByTemplate.get(existing.templateId) ?? [];
      const existingSets = await getSetsBySession(existing.id);
      const filledSlots = new Set(existingSets.map((s) => s.templateExerciseId));
      const hasEmptySlot = tplRows.some(
        (r) => !filledSlots.has(r.templateExercise.id),
      );
      if (!hasEmptySlot) {
        result.skippedAlreadyImported += 1;
        continue;
      }
      // Es gibt leere Slots → erst jetzt die (teurere) Garmin-Detailabfrage.
      const mapped = await collectGarminSets(client, act, aliasMap, dateIso, log);
      if (!mapped) {
        result.skippedAlreadyImported += 1;
        continue;
      }
      const added = await backfillEmptySlots(
        existing.id,
        mapped,
        tplRows,
        filledSlots,
        dryRun,
        act,
        dateIso,
        log,
      );
      if (added > 0) result.imported += 1;
      else result.skippedAlreadyImported += 1;
      continue;
    }

    // Neue Session: Sätze laden + mappen.
    const setsByExerciseId = await collectGarminSets(
      client,
      act,
      aliasMap,
      dateIso,
      log,
    );
    if (!setsByExerciseId) {
      result.skippedUnassigned += 1;
      continue;
    }

    // Einheit zuordnen: erst über den Namen, sonst Workout-Typ-Heuristik.
    const sessionExerciseIds = new Set(setsByExerciseId.keys());
    const match =
      matchTemplateByName(
        act.activityName,
        sessionExerciseIds,
        candidates,
        templateExercisesByTemplate,
      ) ??
      pickBestTemplate(
        sessionExerciseIds,
        candidates,
        templateExercisesByTemplate,
      );
    if (!match) {
      log.push({
        level: "warn",
        message: `Activity ${act.activityId} (${dateIso}, "${act.activityName ?? ""}"): kein Template > ${MATCH_THRESHOLD * 100}% Match — übersprungen.`,
      });
      result.skippedUnassigned += 1;
      continue;
    }

    log.push({
      level: "info",
      message: `Activity ${act.activityId} (${dateIso}, "${act.activityName ?? ""}") → ${match.template.name} (${match.byName ? "per Name, " : ""}${(match.ratio * 100).toFixed(0)}%, ${match.matchedCount}/${sessionExerciseIds.size} Übungen).`,
    });

    if (dryRun) {
      result.imported += 1; // optisch, schreibt aber nicht
      continue;
    }

    // Session anlegen — abfangen, falls schon eine manuelle Session am Datum existiert.
    let sessionId: number;
    try {
      const session = await dbCreateSession({
        templateId: match.template.id,
        date: dateIso,
        notes: act.activityName ?? null,
        source: "garmin",
        garminActivityId: act.activityId,
      });
      sessionId = session.id;
    } catch (err) {
      log.push({
        level: "warn",
        message: `Activity ${act.activityId} (${dateIso}): konnte Session nicht erstellen — bereits manuelle Session am Datum? (${(err as Error).message})`,
      });
      result.skippedConflict += 1;
      continue;
    }

    // Sets pro Template-Exercise nummerieren und schreiben.
    const tplExercises = templateExercisesByTemplate.get(match.template.id)!;
    const tplExerciseByExerciseId = new Map<number, TemplateExerciseRow>();
    for (const row of tplExercises) {
      tplExerciseByExerciseId.set(row.exercise.id, row);
    }

    let setsInserted = 0;
    let setsSkipped = 0;
    for (const [exerciseId, sets] of setsByExerciseId.entries()) {
      const tplRow = tplExerciseByExerciseId.get(exerciseId);
      if (!tplRow) {
        // Übung war zwar in Garmin, aber nicht im erkannten Template.
        // (Z.B. Bonus-Übung am Ende.) Skippen + loggen.
        setsSkipped += sets.length;
        continue;
      }
      // Chronologisch sortieren, dann durchnummerieren — handhabt Supersets.
      const sorted = [...sets].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      for (let i = 0; i < sorted.length; i++) {
        await upsertSet({
          sessionId,
          templateExerciseId: tplRow.templateExercise.id,
          setNumber: i + 1,
          weightKg: Math.round(sorted[i].weightKg * 100) / 100,
          reps: sorted[i].reps,
          weightMode: "per-side",
        });
        setsInserted += 1;
      }
    }

    log.push({
      level: "info",
      message: `   → ${setsInserted} Sätze eingefügt${setsSkipped > 0 ? `, ${setsSkipped} außerhalb des Templates ignoriert` : ""}.`,
    });
    result.imported += 1;
  }

  return result;
}

// ---- helpers ----

type GroupedSet = { startTime: string; weightKg: number; reps: number };

function pickCode(exercise: { category?: string | null; name?: string | null } | undefined): string | null {
  if (!exercise) return null;
  return exercise.name ?? exercise.category ?? null;
}

// Lädt die Garmin-Sätze einer Aktivität und gruppiert sie (gemappt über die
// Alias-Map) nach DB-Übungs-ID. Liefert null, wenn nichts Verwertbares da ist.
// Von Neu-Import UND Backfill geteilt — eine einzige Mapping-Wahrheit.
async function collectGarminSets(
  client: GarminConnect,
  act: GarminActivity,
  aliasMap: Map<string, number>,
  dateIso: string,
  log: ImportLogEntry[],
): Promise<Map<number, GroupedSet[]> | null> {
  let detail: ExerciseSetsResponse;
  try {
    detail = await client.client.get<ExerciseSetsResponse>(
      `https://connectapi.garmin.com/activity-service/activity/${act.activityId}/exerciseSets`,
    );
  } catch (err) {
    log.push({
      level: "error",
      message: `Activity ${act.activityId}: Sets nicht geladen (${(err as Error).message}).`,
    });
    return null;
  }

  const activeSets = (detail.exerciseSets ?? []).filter(
    (s) => s.setType === "ACTIVE",
  );
  if (activeSets.length === 0) {
    log.push({
      level: "warn",
      message: `Activity ${act.activityId} (${dateIso}): keine Active-Sets — übersprungen.`,
    });
    return null;
  }

  const setsByExerciseId = new Map<number, GroupedSet[]>();
  const unmappedCodes = new Set<string>();
  for (const s of activeSets) {
    if (typeof s.weight !== "number" || typeof s.repetitionCount !== "number") {
      continue;
    }
    const code = pickCode(s.exercises?.[0]);
    if (!code) {
      unmappedCodes.add("(no code)");
      continue;
    }
    const exerciseId = aliasMap.get(code.toLowerCase());
    if (!exerciseId) {
      unmappedCodes.add(code);
      continue;
    }
    const list = setsByExerciseId.get(exerciseId) ?? [];
    list.push({
      startTime: s.startTime,
      weightKg: s.weight / 1000,
      reps: s.repetitionCount,
    });
    setsByExerciseId.set(exerciseId, list);
  }

  if (unmappedCodes.size > 0) {
    log.push({
      level: "warn",
      message: `Activity ${act.activityId} (${dateIso}): unbekannte Garmin-Codes ignoriert: ${[...unmappedCodes].join(", ")}`,
    });
  }
  if (setsByExerciseId.size === 0) {
    log.push({
      level: "warn",
      message: `Activity ${act.activityId} (${dateIso}): kein Set ließ sich mappen.`,
    });
    return null;
  }
  return setsByExerciseId;
}

// Trägt Garmin-Sätze NUR in Slots nach, die in der Session noch leer sind.
// Bereits vorhandene Sätze (manuell wie importiert) werden nicht angefasst.
async function backfillEmptySlots(
  sessionId: number,
  mapped: Map<number, GroupedSet[]>,
  tplRows: TemplateExerciseRow[],
  filledSlots: Set<number>,
  dryRun: boolean,
  act: GarminActivity,
  dateIso: string,
  log: ImportLogEntry[],
): Promise<number> {
  const tplByExerciseId = new Map<number, TemplateExerciseRow>();
  for (const r of tplRows) tplByExerciseId.set(r.exercise.id, r);

  let added = 0;
  const filledNames: string[] = [];
  for (const [exerciseId, sets] of mapped.entries()) {
    const tplRow = tplByExerciseId.get(exerciseId);
    if (!tplRow) continue; // Übung gehört nicht zu diesem Template.
    if (filledSlots.has(tplRow.templateExercise.id)) continue; // Slot schon gefüllt.
    const sorted = [...sets].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
    if (!dryRun) {
      for (let i = 0; i < sorted.length; i++) {
        await upsertSet({
          sessionId,
          templateExerciseId: tplRow.templateExercise.id,
          setNumber: i + 1,
          weightKg: Math.round(sorted[i].weightKg * 100) / 100,
          reps: sorted[i].reps,
          weightMode: "per-side",
        });
      }
    }
    added += sorted.length;
    filledNames.push(`${tplRow.exercise.name} (${sorted.length})`);
  }

  if (added > 0) {
    log.push({
      level: "info",
      message: `Activity ${act.activityId} (${dateIso}): ${added} Sätze in leere Slots nachgetragen → ${filledNames.join(", ")}.`,
    });
  }
  return added;
}

type TemplateMatch = {
  template: WorkoutTemplate;
  ratio: number;
  matchedCount: number;
  byName: boolean;
};

// Anteil der Session-Übungen, die in der Einheit vorkommen.
function scoreTemplate(
  sessionExerciseIds: Set<number>,
  tpl: WorkoutTemplate,
  templateExercises: Map<number, TemplateExerciseRow[]>,
): { ratio: number; matchedCount: number } {
  const tplExs = templateExercises.get(tpl.id) ?? [];
  const tplExIds = new Set(tplExs.map((r) => r.exercise.id));
  let matched = 0;
  for (const id of sessionExerciseIds) {
    if (tplExIds.has(id)) matched += 1;
  }
  return { ratio: matched / sessionExerciseIds.size, matchedCount: matched };
}

// Startet man auf der Uhr ein Garmin-Workout, heißt die Aktivität wie das
// Workout (z.B. "Push"). Gibt es eine Einheit mit genau diesem Namen, ist die
// Zuordnung eindeutig — auch bei abgebrochenem Training mit wenigen Übungen,
// wo die Heuristik an MIN_MATCHED_EXERCISES scheitern würde. Mindestens eine
// Übung muss aber passen, sonst entstünde eine leere Session.
function matchTemplateByName(
  activityName: string | null | undefined,
  sessionExerciseIds: Set<number>,
  templates: WorkoutTemplate[],
  templateExercises: Map<number, TemplateExerciseRow[]>,
): TemplateMatch | null {
  const name = activityName?.trim().toLowerCase();
  if (!name) return null;
  const tpl = templates.find((t) => t.name.trim().toLowerCase() === name);
  if (!tpl) return null;
  const score = scoreTemplate(sessionExerciseIds, tpl, templateExercises);
  if (score.matchedCount === 0) return null;
  return { template: tpl, ...score, byName: true };
}

function pickBestTemplate(
  sessionExerciseIds: Set<number>,
  templates: WorkoutTemplate[],
  templateExercises: Map<number, TemplateExerciseRow[]>,
): TemplateMatch | null {
  let best: TemplateMatch | null = null;
  for (const tpl of templates) {
    const score = scoreTemplate(sessionExerciseIds, tpl, templateExercises);
    // Bei Gleichstand gewinnt die Einheit, die aktuell in Rotation ist —
    // alte Einheiten teilen sich viele Übungen mit den neuen.
    const better =
      best === null ||
      score.ratio > best.ratio ||
      (score.ratio === best.ratio && tpl.inRotation && !best.template.inRotation);
    if (better) {
      best = { template: tpl, ...score, byName: false };
    }
  }
  if (best === null) return null;
  if (best.ratio < MATCH_THRESHOLD) return null;
  if (best.matchedCount < MIN_MATCHED_EXERCISES) return null;
  return best;
}
