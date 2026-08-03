import { isDemoRequest } from "./config";

// Im Demo-Modus ist fast alles erlaubt — Sätze loggen, Gewicht eintragen,
// Plan-Sessions verschieben — weil jede Demo-Sitzung auf einer eigenen DB
// läuft, die täglich neu erzeugt wird. Gesperrt bleibt nur, was echte
// Zugangsdaten benutzt (Garmin/FDDB/Sheets) oder minutenlang KI-Tokens
// verbrennt (Plan-Generierung).
export const DEMO_BLOCKED_MESSAGE =
  "Im Demo-Modus deaktiviert — diese Funktion greift auf externe Konten zu.";

export const DEMO_BLOCKED_AI_MESSAGE =
  "Im Demo-Modus deaktiviert — die Plan-Generierung läuft mehrere Minuten. Der fertige Plan ist bereits hinterlegt.";

/** true, wenn der aufrufende Request im Demo-Modus läuft. */
export async function isDemo(): Promise<boolean> {
  return isDemoRequest();
}
