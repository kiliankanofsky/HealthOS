import type { NewWeightEntry } from "@/lib/db/schema";
import type { SyncableAdapter } from "./types";

// Stub für Garmin-Connect-Integration. In Phase 2 implementieren.
// Quelle: Garmin Connect Body Composition / Weight API.
export const garminAdapter: SyncableAdapter = {
  name: "garmin",

  async fetchWeightEntries(_options?: { since?: string }): Promise<NewWeightEntry[]> {
    // TODO(phase-2): Garmin OAuth, Body-Composition-Endpoint abfragen, normalisieren.
    throw new Error("garminAdapter.fetchWeightEntries: not implemented");
  },

  async sync(_options?: { since?: string }) {
    throw new Error("garminAdapter.sync: not implemented");
  },
};
