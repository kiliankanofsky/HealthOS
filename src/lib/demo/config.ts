// Öffentlicher Demo-Modus: die App lässt sich ohne Login mit Mock-Daten
// ansehen. Umgeschaltet wird pro Request über ein Cookie — die eigentliche
// Trennung passiert in src/lib/db/index.ts (`getDb()`), das bei gesetztem
// Cookie eine komplett eigene Datenbank liefert.
//
// Failsafe: ist keine Demo-DB konfiguriert, ist der Modus komplett aus —
// dann lässt auch der Proxy (src/proxy.ts) das Cookie nicht mehr durch.

export const DEMO_COOKIE = "healthos_demo";

/** Nur lokal (file-DB) oder wenn eine eigene Turso-Demo-DB hinterlegt ist. */
export function isDemoConfigured(): boolean {
  const useTurso = Boolean(process.env.VERCEL) || process.env.USE_TURSO === "1";
  if (!useTurso) return true;
  return Boolean(process.env.TURSO_DEMO_DATABASE_URL);
}

/**
 * Liest das Demo-Cookie. Läuft bewusst über einen dynamischen Import, damit
 * dieselben Query-Funktionen auch außerhalb eines Requests benutzbar bleiben
 * (Sync-Skripte in scripts/, tsx-CLIs) — dort gibt es keinen Cookie-Store,
 * und wir fallen still auf die echte DB zurück.
 */
export async function isDemoRequest(): Promise<boolean> {
  if (!isDemoConfigured()) return false;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return jar.get(DEMO_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}
