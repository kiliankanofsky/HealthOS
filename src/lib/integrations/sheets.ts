import type { NewWeightEntry } from "@/lib/db/schema";
import { upsertWeightEntry } from "@/lib/db/queries";
import { parseCSV } from "@/lib/utils/csv";
import { toLocalISODate } from "@/lib/utils/date";
import { isoWeekMonday, isoWeeksInYear } from "@/lib/utils/iso-week";
import type { SyncableAdapter } from "./types";

// Erwartete Sheet-Struktur:
// Spalte 0: KW (ISO-Kalenderwoche)
// Spalten 4-10: Mo, Di, Mi, Do, Fr, Sa, So (Tagesgewichte mit deutschem Komma-Dezimal)
// Eine Zeile pro Woche, leere Zellen = keine Messung an dem Tag.
//
// Da der Sheet keine Jahres-Spalte hat, wird das Jahr durch KW-Reset getrackt:
// Sobald die KW von Zeile zu Zeile zurückspringt (z. B. 52 → 1), inkrementieren wir das Jahr.
//
// Konfiguration via Env-Vars:
//   SHEETS_CSV_URL      Pflicht. Public CSV-Export-URL des Sheets.
//   SHEETS_START_YEAR   Optional. Default: aktuelles Jahr minus 2.

const KW_INDEX = 0;
const FIRST_DAY_INDEX = 4; // Mo
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

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

    // Header ignorieren, leere Zeilen filtern, ungültige KW-Werte überspringen.
    const dataRows = rows.slice(1).filter((row) => {
      const kw = Number(row[KW_INDEX]);
      return Number.isInteger(kw) && kw >= 1 && kw <= 53;
    });

    const entries: NewWeightEntry[] = [];
    let year = startYear;
    let prevKw: number | null = null;

    for (const row of dataRows) {
      const kw = Number(row[KW_INDEX]);
      if (prevKw !== null && kw < prevKw) {
        // KW ist zurückgesprungen → neues Jahr.
        year += 1;
      }
      prevKw = kw;

      const maxKw = isoWeeksInYear(year);
      if (kw > maxKw) continue; // Defensive Sicherung.

      const monday = isoWeekMonday(year, kw);

      for (let d = 0; d < DAYS.length; d++) {
        const cell = row[FIRST_DAY_INDEX + d];
        if (cell === undefined) continue;
        const weight = parseGermanNumber(cell);
        if (weight === null) continue;
        if (weight < 30 || weight > 250) continue; // Plausibilitäts-Filter.

        const date = new Date(monday);
        date.setUTCDate(monday.getUTCDate() + d);
        const isoDate = toLocalISODate(
          // Wir konstruieren das Datum in UTC, formatieren aber als lokales ISO-Datum
          // ohne Zeitzonen-Drift. UTC-Felder reichen, da nur Y/M/D zählen.
          new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        );

        entries.push({
          date: isoDate,
          weightKg: Math.round(weight * 100) / 100,
          source: "sheets",
          notes: null,
        });
      }
    }

    // Bei Duplikaten gleicher Datumswerte (z. B. Sheet enthielt sie mehrfach)
    // gewinnt der zuletzt gesehene Eintrag.
    const byDate = new Map<string, NewWeightEntry>();
    for (const entry of entries) {
      byDate.set(entry.date, entry);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  },

  async sync() {
    const entries = await this.fetchWeightEntries();
    let inserted = 0;
    let updated = 0;
    for (const entry of entries) {
      // upsertWeightEntry liefert den Eintrag zurück, aber kennt nicht
      // ob es ein Insert oder Update war. Für ein einfaches Reporting
      // genügt uns die Gesamtzahl als "synced".
      upsertWeightEntry(entry);
      inserted++;
    }
    return { inserted, updated };
  },
};
