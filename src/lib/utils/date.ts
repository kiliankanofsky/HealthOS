// Lokales ISO-Datum YYYY-MM-DD (ohne UTC-Shift).
// Nötig, weil Date.toISOString() nach UTC konvertiert und in CET/CEST den Vortag liefert.
export function toLocalISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "Heute" verlässlich in Europe/Berlin — UNABHÄNGIG von der Server-Zeitzone.
// toLocalISODate() liest die lokale TZ des Prozesses; auf Vercel ist das UTC,
// wodurch "heute" in den frühen deutschen Morgenstunden auf den Vortag fällt.
// Für KI-Kontext (Datum/Wochentag) brauchen wir die deutsche Kalender-Sicht.
export function todayBerlinISO(now: Date = new Date()): string {
  // en-CA formatiert als YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Deutsches Datum inkl. Wochentag aus einem ISO-Datum, z.B.
// "Montag, 16.06.2026". Der Wochentag eines bekannten Datums ist
// zeitzonen-unkritisch (lokale Mitternacht des Datums).
export function germanDateWithWeekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
