import type { NewNutritionEntry } from "@/lib/db/schema";

// Schnittstelle für Ernährungs-Quellen (kcal/Makros pro Tag).
//
// Für Gewicht gibt es bewusst kein Gegenstück mehr: der Google-Sheets-Import
// lief bis 29.06.2026 und ist ausgebaut, Gewichtseinträge entstehen seitdem
// ausschließlich in der UI. Ein späterer Quellen-Wechsel hier (fddb →
// YAZIO/Apple Health) bleibt ein 1-Datei-Eingriff.
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
