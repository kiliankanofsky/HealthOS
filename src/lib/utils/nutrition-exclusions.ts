// Ausgeschlossene Nutrition-Zeiträume — Tage, an denen fddb nur sporadisch
// benutzt wurde (Urlaub o.ä.).
//
// Der Tageswert existiert weiterhin in `nutrition_entries` (nichts wird extern
// in fddb gelöscht), taugt aber nicht als Tagesbilanz. Überall, wo Kalorien
// ausgewertet werden — Chart, Empfehlung, TDEE-Schätzung, KI-Kontext, Wochen-
// Matrix — zählen diese Tage deshalb als „kein Wert", nicht als Null.
//
// Gepflegt werden die Zeiträume ausschließlich von Hand (Dialog im
// Kalorien-Verlauf auf /weight); nichts leitet sie automatisch ab.

/** Minimal-Form eines Zeitraums — `NutritionExclusion` ist zuweisbar. */
export type NutritionExclusionRange = {
  startDate: string;
  /** Inklusiv. null = offenes Ende (gilt bis heute). */
  endDate: string | null;
};

export function isDateExcluded(
  exclusions: readonly NutritionExclusionRange[],
  date: string,
): boolean {
  for (const ex of exclusions) {
    if (ex.startDate <= date && (ex.endDate == null || ex.endDate >= date)) {
      return true;
    }
  }
  return false;
}

/**
 * Vorgebundene Variante für Schleifen über viele Tage. In der Praxis gibt es
 * eine Handvoll Zeiträume — die lineare Suche ist billiger als jeder Index,
 * der Helfer spart nur das Durchreichen der Liste.
 */
export function buildExclusionLookup(
  exclusions: readonly NutritionExclusionRange[],
): (date: string) => boolean {
  return (date: string) => isDateExcluded(exclusions, date);
}
