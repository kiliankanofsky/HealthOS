import type { NewWeightEntry } from "@/lib/db/schema";

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
