// Liefert das Datum des Montags einer ISO-Kalenderwoche.
// ISO 8601: KW 1 ist die Woche, die den ersten Donnerstag des Jahres enthält
// (alternativ: die Woche, die den 4. Januar enthält).
export function isoWeekMonday(year: number, week: number): Date {
  // Starte am 4. Januar des Jahres (immer in KW 1) und schiebe.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1 = Mo ... 7 = So
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

// Anzahl ISO-Wochen in einem Jahr (52 oder 53).
export function isoWeeksInYear(year: number): number {
  // Ein ISO-Jahr hat 53 Wochen, wenn der 1. Januar oder der 31. Dezember ein Donnerstag ist
  // (oder bei Schaltjahren der 1. Januar ein Mittwoch).
  const dec31 = new Date(Date.UTC(year, 11, 31));
  const day = dec31.getUTCDay() || 7;
  if (day === 4) return 53;
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1Day = jan1.getUTCDay() || 7;
  if (jan1Day === 4) return 53;
  return 52;
}
