// Lücken in Verlaufs-Charts — durchgezogen nur über echten Werten,
// gestrichelt darüber hinweg.
//
// Beide Charts auf /weight laufen über eine lückenlose Tages-Achse: der
// Gewichts-Verlauf über alle Kalendertage (auch ohne Wiegung), der
// Kalorien-Verlauf zusätzlich über bewusst ausgeschlossene Zeiträume
// (sporadisches fddb-Tracking). Fehlende Tage bleiben `null`, Recharts
// unterbricht die Linie dort (`connectNulls={false}`) — und eine zweite,
// gestrichelte Linie überbrückt genau die Lücke. So bleibt der Verlauf
// lesbar, ohne dass eine erfundene Linie wie eine Messung aussieht.

/**
 * Erzeugt aus einer Wert-Reihe die „Ghost"-Reihe für die gestrichelte
 * Überbrückung: gesetzt sind nur die Lücken-Positionen selbst (linear
 * interpoliert) plus die beiden angrenzenden echten Werte als Anker. Alles
 * andere bleibt `undefined`, damit Recharts ausschließlich über den Lücken
 * zeichnet und nicht neben ihnen.
 *
 * Lücken am Anfang oder Ende der Reihe bekommen keine Brücke — es gibt nichts
 * zu verbinden, und eine flache Linie ins Nichts wäre eine Behauptung.
 *
 * Randfall: Liegt zwischen zwei Lücken genau EIN echter Wert, teilen sich ihre
 * Brücken benachbarte Anker und Recharts zieht sie zu einem Pfad zusammen — die
 * gestrichelte Linie läuft dann auch unter dem einen echten Segment durch. Sie
 * wird dort von der durchgezogenen Linie überdeckt (die später gezeichnet wird);
 * eine echte Trennung wäre nur mit einer zweiten Ghost-Reihe möglich und das ist
 * den Aufwand nicht wert.
 */
export function buildGapBridge(
  values: readonly (number | null | undefined)[],
): (number | undefined)[] {
  const out = new Array<number | undefined>(values.length).fill(undefined);
  const has = (i: number): boolean =>
    i >= 0 && i < values.length && values[i] != null;

  let i = 0;
  while (i < values.length) {
    if (has(i)) {
      i++;
      continue;
    }
    // Lücken-Lauf [i, end) bestimmen.
    let end = i;
    while (end < values.length && !has(end)) end++;

    const prev = i - 1;
    const next = end;
    if (has(prev) && has(next)) {
      const prevV = values[prev] as number;
      const nextV = values[next] as number;
      out[prev] = prevV;
      out[next] = nextV;
      for (let k = i; k < end; k++) {
        const t = (k - prev) / (next - prev);
        out[k] = prevV + (nextV - prevV) * t;
      }
    }
    i = end;
  }
  return out;
}
