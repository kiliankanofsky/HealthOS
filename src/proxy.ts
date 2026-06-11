import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

// Schützt die ganze App hinter dem Login: ohne gültige Session → /account.
// Echte Session-Validierung (nicht nur Cookie-Existenz) — der Proxy läuft
// in Next 16 auf der Node-Runtime, und dank Cookie-Cache (lib/auth.ts)
// kostet das meist keinen DB-Roundtrip.
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Alles außer: /account (Login-Seite), /api (Auth-Endpunkte unter
  // /api/auth; /api/cron/sync schützt sich selbst per CRON_SECRET),
  // Next-Interna und statischen Dateien (Bilder, Icons, …).
  matcher: [
    "/((?!account|api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|txt|xml)$).*)",
  ],
};
