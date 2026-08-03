"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DEMO_COOKIE, isDemoConfigured } from "@/lib/demo/config";
import { ensureDemoDataFresh } from "@/lib/demo/seed";

// Betritt den öffentlichen Demo-Modus: Cookie setzen → der Proxy lässt ab
// jetzt alle Seiten ohne Login durch, und getDb() (src/lib/db/index.ts)
// liefert für diesen Browser die Demo-Datenbank statt der echten.
export async function startDemoSession(): Promise<{ error: string } | void> {
  if (!isDemoConfigured()) {
    return { error: "Der Demo-Modus ist auf dieser Installation nicht eingerichtet." };
  }

  try {
    // Die Mock-Daten hängen an „heute" (Wochen-Totals, nächste Session, …).
    // Sind sie von gestern, werden sie hier neu erzeugt — im Normalfall ist
    // das ein einzelner Lesezugriff, weil der Cron schon nachgezogen hat.
    await ensureDemoDataFresh();
  } catch (error) {
    return {
      error: `Demo-Daten konnten nicht vorbereitet werden: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const jar = await cookies();
  jar.set(DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect("/");
}

// Verlässt den Demo-Modus wieder (Button im Demo-Banner).
export async function endDemoSession(): Promise<void> {
  await clearDemoSession();
  redirect("/account");
}

// Nur das Cookie löschen, ohne Weiterleitung. Wird nach einem erfolgreichen
// Login aufgerufen: sonst gewinnt ein übrig gebliebenes Demo-Cookie gegen die
// frische Session (der Proxy prüft es zuerst) und der Besitzer sähe nach dem
// Anmelden weiter Mock-Daten.
export async function clearDemoSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
}
