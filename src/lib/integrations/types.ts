import type { NewNutritionEntry, NewWeightEntry } from "@/lib/db/schema";

// Gemeinsame Schnittstelle für externe Datenquellen.
// Adapter implementieren fetchWeightEntries() und liefern Daten im DB-kompatiblen Format.
// Phase 1: Stubs. Spätere Integrationen (Sheets, Garmin, FDDB) implementieren dieses Interface.
export interface WeightSourceAdapter {
  readonly name: string;

  // Holt rohe Einträge aus der externen Quelle, normalisiert sie ins DB-Schema.
  fetchWeightEntries(options?: {
    since?: string; // ISO-Date YYYY-MM-DD
  }): Promise<NewWeightEntry[]>;
}

// Helfer: Adapter, der schreibend in die DB synchronisiert (Pattern für später).
// Wird in Phase 1 nicht implementiert, aber zeigt, wie Adapter eingehängt werden.
export interface SyncableAdapter extends WeightSourceAdapter {
  sync(options?: { since?: string }): Promise<{ inserted: number; updated: number }>;
}

// Eigenes Interface für Ernährungs-Quellen (kcal/Makros pro Tag).
// Bewusst getrennt von WeightSourceAdapter — die Datenform unterscheidet sich,
// und ein späterer Wechsel (fddb → YAZIO/Apple Health) bleibt ein 1-Datei-Eingriff.
export interface NutritionSourceAdapter {
  readonly name: string;

  // Holt Tages-Summen ab `since` (inkl.) bis heute (inkl.) in chronologischer
  // Reihenfolge. Bei fehlenden Tagen (z.B. nichts geloggt) wird der Tag
  // ausgelassen, kein 0-Eintrag erzeugt.
  fetchNutritionEntries(options: {
    since: string; // ISO-Date YYYY-MM-DD
    until?: string; // ISO-Date YYYY-MM-DD, default heute
  }): Promise<NewNutritionEntry[]>;
}
