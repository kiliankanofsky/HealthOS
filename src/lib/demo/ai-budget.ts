// Stunden-Budget für KI-Aufrufe im öffentlichen Demo-Modus.
//
// Der Demo-Modus soll die KI-Funktionen zeigen — Tagesübersicht und Chat sind
// der interessanteste Teil der App. Die Tokens gehen aber auf den API-Key des
// Betreibers, und die Demo ist per Definition anonym erreichbar. Deshalb ein
// gemeinsamer Deckel über ALLE Demo-Besucher: läuft er voll, antwortet die App
// mit einem Hinweis statt mit einem Fehler.
//
// Außerhalb des Demo-Modus (eingeloggter Betreiber, Cron, Skripte) greift
// nichts davon — dort ist `consumeDemoAiBudget()` ein No-op.

import { sql } from "drizzle-orm";

import { getDemoDb } from "@/lib/db";
import { demoAiCalls } from "@/lib/db/schema";
import { isDemoRequest } from "./config";

/** Claude-Aufrufe pro Stunde, die sich alle Demo-Besucher zusammen teilen. */
export const DEMO_AI_CALLS_PER_HOUR = 40;

export const DEMO_AI_BUDGET_MESSAGE =
  "Das KI-Kontingent der öffentlichen Demo ist für diese Stunde aufgebraucht. " +
  "Die bereits generierte Tagesübersicht bleibt sichtbar — für unbegrenzte " +
  "Nutzung die App lokal starten und einen eigenen API-Key hinterlegen.";

/** UTC-Stundenschlüssel, z.B. "2026-08-06T14". */
function currentBucket(now = new Date()): string {
  return now.toISOString().slice(0, 13);
}

export type DemoAiBudget = { ok: true } | { ok: false; error: string };

/**
 * Zählt einen KI-Aufruf auf das Stundenkontingent und sagt, ob er noch
 * gedeckt ist. Ein einziges INSERT … ON CONFLICT DO UPDATE … RETURNING —
 * damit ist Zählen und Prüfen atomar und übersteht parallele Requests.
 *
 * Fällt der Zähler aus (z.B. Demo-DB kurz nicht erreichbar), wird der Aufruf
 * abgelehnt statt durchgewunken: ein kaputter Zähler darf keine offene
 * Kostenschleuse werden.
 */
export async function consumeDemoAiBudget(): Promise<DemoAiBudget> {
  if (!(await isDemoRequest())) return { ok: true };

  try {
    const db = getDemoDb();
    const [row] = await db
      .insert(demoAiCalls)
      .values({ bucket: currentBucket(), count: 1 })
      .onConflictDoUpdate({
        target: demoAiCalls.bucket,
        set: { count: sql`${demoAiCalls.count} + 1` },
      })
      .returning({ count: demoAiCalls.count });

    if (!row || row.count > DEMO_AI_CALLS_PER_HOUR) {
      return { ok: false, error: DEMO_AI_BUDGET_MESSAGE };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: DEMO_AI_BUDGET_MESSAGE };
  }
}
