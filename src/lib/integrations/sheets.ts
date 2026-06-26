import type { NewWeightEntry, NewWeightPhase, PhaseKind } from "@/lib/db/schema";
import {
  clearPhasesBySource,
  upsertPhase,
  upsertWeightEntry,
} from "@/lib/db/queries";
import { parseCSV } from "@/lib/utils/csv";
import { toLocalISODate } from "@/lib/utils/date";
import { isoWeekMonday, isoWeeksInYear } from "@/lib/utils/iso-week";
import type { SyncableAdapter } from "./types";

// Erwartete Sheet-Struktur:
// Spalte 0: KW (ISO-Kalenderwoche)
// Eine Spalte mit Header enthält "Woche" und "Phase" (z. B. "Woche Phase") —
// hochlaufender Zähler je Phase, springt bei neuer Phase auf 1 zurück.
// Spalten 4-10: Mo, Di, Mi, Do, Fr, Sa, So (Tagesgewichte mit deutschem Komma-Dezimal)
// Eine Zeile pro Woche, leere Zellen = keine Messung an dem Tag.
//
// Da der Sheet keine Jahres-Spalte hat, wird das Jahr durch KW-Reset getrackt:
// Sobald die KW von Zeile zu Zeile zurückspringt (z. B. 52 → 1), inkrementieren wir das Jahr.
//
// Phasen-Ableitung: Anker ist KW 10 2026 = Defizit (cut). Phasen alternieren
// (cut/bulk/cut/...). Der Phasen-Wechsel wird an einem Reset des "Woche Phase"-
// Zählers auf 1 erkannt.
//
// Konfiguration via Env-Vars:
//   SHEETS_CSV_URL      Pflicht. Public CSV-Export-URL des Sheets.
//   SHEETS_START_YEAR   Optional. Default: aktuelles Jahr minus 2.

const KW_INDEX = 0;
const FIRST_DAY_INDEX = 4; // Mo
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const PHASE_ANCHOR = { year: 2026, kw: 10, kind: "cut" as PhaseKind };

function parseGermanNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value;
}

function getSheetUrl(): string {
  const url = process.env.SHEETS_CSV_URL;
  if (!url || url.length === 0) {
    throw new Error(
      "SHEETS_CSV_URL ist nicht gesetzt. Lege sie in .env.local an.",
    );
  }
  return url;
}

function getStartYear(): number {
  const fromEnv = process.env.SHEETS_START_YEAR;
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed)) return parsed;
  }
  return new Date().getFullYear() - 2;
}

// Findet den Spaltenindex der "Woche Phase"-Spalte (case-insensitive, tolerant
// gegenüber Reihenfolge und Trennzeichen). Gibt -1 zurück, wenn nicht gefunden.
function findPhaseWeekColumn(header: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (h.includes("woche") && h.includes("phase")) return i;
  }
  return -1;
}

type ParsedRow = {
  year: number;
  kw: number;
  monday: Date;
  weights: Array<number | null>; // 7 Tage
  phaseCounter: number | null;
};

function parseRows(rows: string[][], startYear: number): ParsedRow[] {
  if (rows.length < 2) return [];
  const header = rows[0];
  const phaseColIdx = findPhaseWeekColumn(header);

  const dataRows = rows.slice(1).filter((row) => {
    const kw = Number(row[KW_INDEX]);
    return Number.isInteger(kw) && kw >= 1 && kw <= 53;
  });

  const parsed: ParsedRow[] = [];
  let year = startYear;
  let prevKw: number | null = null;

  for (const row of dataRows) {
    const kw = Number(row[KW_INDEX]);
    if (prevKw !== null && kw < prevKw) year += 1;
    prevKw = kw;

    const maxKw = isoWeeksInYear(year);
    if (kw > maxKw) continue;

    const monday = isoWeekMonday(year, kw);
    const weights: Array<number | null> = [];
    for (let d = 0; d < DAYS.length; d++) {
      const cell = row[FIRST_DAY_INDEX + d];
      const w = cell !== undefined ? parseGermanNumber(cell) : null;
      const valid = w !== null && w >= 30 && w <= 250;
      weights.push(valid ? Math.round(w * 100) / 100 : null);
    }

    let phaseCounter: number | null = null;
    if (phaseColIdx >= 0) {
      const raw = row[phaseColIdx]?.trim();
      const parsedNum = raw ? Number(raw) : NaN;
      if (Number.isInteger(parsedNum) && parsedNum >= 1) {
        phaseCounter = parsedNum;
      }
    }

    parsed.push({ year, kw, monday, weights, phaseCounter });
  }

  return parsed;
}

// Leitet Phasen-Boundaries aus dem Phasen-Zähler ab. Eine neue Phase startet
// dort, wo der Zähler auf 1 zurückspringt — oder am ersten Vorkommen eines
// Zählers, wenn vorher keiner gesetzt war.
//
// Phasen-Art: Anker (KW 10 2026 = cut) bestimmt eine Phase, alle anderen
// alternieren rückwärts/vorwärts (bulk ↔ cut).
function derivePhases(rows: ParsedRow[]): NewWeightPhase[] {
  if (rows.length === 0) return [];

  // Boundaries: Liste der Indizes, an denen eine neue Phase beginnt.
  const boundaries: number[] = [];
  let lastCounter: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].phaseCounter;
    if (c === null) {
      // Lücke: Zähler nicht gesetzt → ignorieren, kein Phasen-Schnitt.
      lastCounter = null;
      continue;
    }
    if (c === 1) {
      // Reset → neue Phase, aber nur wenn vorher kein 1 war (Sheet kann
      // mehrere 1en hintereinander haben? Eher nicht, aber defensiv).
      if (lastCounter !== 1) boundaries.push(i);
    } else if (lastCounter === null) {
      // Phasen-Daten beginnen mitten in einer Phase. Anker-Boundary setzen.
      boundaries.push(i);
    }
    lastCounter = c;
  }

  if (boundaries.length === 0) return [];

  // Anker-Index suchen: die Boundary, deren Wochenmontag in oder vor KW10/2026
  // liegt UND bei der die nächste Boundary (falls vorhanden) erst nach KW10/2026
  // liegt — das ist die KW10/2026-Phase selbst.
  const anchorMonday = isoWeekMonday(PHASE_ANCHOR.year, PHASE_ANCHOR.kw).getTime();
  let anchorBoundaryIdx = -1;
  for (let bi = 0; bi < boundaries.length; bi++) {
    const start = rows[boundaries[bi]].monday.getTime();
    const nextStart =
      bi + 1 < boundaries.length
        ? rows[boundaries[bi + 1]].monday.getTime()
        : Number.POSITIVE_INFINITY;
    if (start <= anchorMonday && anchorMonday < nextStart) {
      anchorBoundaryIdx = bi;
      break;
    }
  }
  // Fallback: jüngste Boundary, die ≤ anchor liegt.
  if (anchorBoundaryIdx === -1) {
    for (let bi = boundaries.length - 1; bi >= 0; bi--) {
      if (rows[boundaries[bi]].monday.getTime() <= anchorMonday) {
        anchorBoundaryIdx = bi;
        break;
      }
    }
  }
  // Wenn der Anker komplett vor allen Boundaries liegt: die erste Boundary ist
  // die früheste bekannte Phase — wir kennen ihren Typ aber nicht. Wir nehmen
  // an, dass der Anker zur frühesten Boundary gehört.
  if (anchorBoundaryIdx === -1) anchorBoundaryIdx = 0;

  const phases: NewWeightPhase[] = boundaries.map((rowIdx, bi) => {
    const row = rows[rowIdx];
    const startISO = toLocalISODate(
      new Date(
        row.monday.getUTCFullYear(),
        row.monday.getUTCMonth(),
        row.monday.getUTCDate(),
      ),
    );

    // Enddatum: einen Tag vor dem Start der nächsten Phase. Letzte Phase = null.
    let endISO: string | null = null;
    if (bi + 1 < boundaries.length) {
      const next = rows[boundaries[bi + 1]].monday;
      const end = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate() - 1),
      );
      endISO = toLocalISODate(
        new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
      );
    }

    // Phasen-Art ableiten: Distanz zum Anker bestimmt Alternierung.
    const dist = bi - anchorBoundaryIdx;
    const kind: PhaseKind =
      dist % 2 === 0
        ? PHASE_ANCHOR.kind
        : PHASE_ANCHOR.kind === "cut"
          ? "bulk"
          : "cut";

    return {
      kind,
      startDate: startISO,
      endDate: endISO,
      label: null,
      source: "sheets",
    };
  });

  return phases;
}

export const sheetsAdapter: SyncableAdapter = {
  name: "sheets",

  async fetchWeightEntries(): Promise<NewWeightEntry[]> {
    const url = getSheetUrl();
    const startYear = getStartYear();

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(
        `Sheet-Download fehlgeschlagen: ${response.status} ${response.statusText}`,
      );
    }
    const csv = await response.text();
    const rows = parseCSV(csv);
    const parsed = parseRows(rows, startYear);

    const entries: NewWeightEntry[] = [];
    for (const r of parsed) {
      for (let d = 0; d < DAYS.length; d++) {
        const w = r.weights[d];
        if (w === null) continue;
        const date = new Date(r.monday);
        date.setUTCDate(r.monday.getUTCDate() + d);
        const isoDate = toLocalISODate(
          new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        );
        entries.push({
          date: isoDate,
          weightKg: w,
          source: "sheets",
          notes: null,
        });
      }
    }

    const byDate = new Map<string, NewWeightEntry>();
    for (const entry of entries) byDate.set(entry.date, entry);
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  },

  async sync() {
    const url = getSheetUrl();
    const startYear = getStartYear();

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(
        `Sheet-Download fehlgeschlagen: ${response.status} ${response.statusText}`,
      );
    }
    const csv = await response.text();
    const rows = parseCSV(csv);
    const parsed = parseRows(rows, startYear);

    // Gewichte upserten.
    let inserted = 0;
    for (const r of parsed) {
      for (let d = 0; d < DAYS.length; d++) {
        const w = r.weights[d];
        if (w === null) continue;
        const date = new Date(r.monday);
        date.setUTCDate(r.monday.getUTCDate() + d);
        const isoDate = toLocalISODate(
          new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        );
        // Bewusst kein cheatDay/alcohol/notes übergeben — upsertWeightEntry
        // lässt nicht-übergebene Felder bei einem Konflikt unangetastet,
        // damit manuell gepflegte Tags beim Sheets-Sync erhalten bleiben.
        upsertWeightEntry({
          date: isoDate,
          weightKg: w,
          source: "sheets",
        });
        inserted++;
      }
    }

    // Phasen aus dem Sheet herleiten und NUR die 'sheets'-Phasen ersetzen.
    // Manuell gepflegte Phasen (source='manual', z. B. eine Maintenance-Phase,
    // die das Sheet gar nicht ausdrücken kann) bleiben erhalten — sonst würde
    // jeder Sync sie wieder löschen. phaseForDate() wählt bei Überlappung die
    // zuletzt begonnene Phase, sodass eine manuelle Phase die Sheet-Phase
    // korrekt überschattet.
    const phases = derivePhases(parsed);
    if (phases.length > 0) {
      await clearPhasesBySource("sheets");
      for (const p of phases) await upsertPhase(p);
    }

    return { inserted, updated: 0 };
  },
};
