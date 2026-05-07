import type { NewWeightEntry } from "@/lib/db/schema";
import type { WeightSourceAdapter } from "./types";

// Stub für FDDB (Lebensmitteldatenbank) — primär für Kalorien-/Ernährungsdaten gedacht.
// Gewicht wird hier üblicherweise nicht geliefert, der Stub bleibt aber für die
// einheitliche Adapter-Struktur in Phase 1 erhalten.
export const fddbAdapter: WeightSourceAdapter = {
  name: "fddb",

  async fetchWeightEntries(_options?: { since?: string }): Promise<NewWeightEntry[]> {
    // TODO(phase-2): Falls FDDB Gewichtstracking anbietet, hier abfragen.
    // Wahrscheinlicher: separates Adapter-Interface für Kalorien/Makros einführen.
    throw new Error("fddbAdapter.fetchWeightEntries: not implemented");
  },
};
