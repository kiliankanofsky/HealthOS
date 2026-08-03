import type { Metadata } from "next";
import { headers } from "next/headers";

import { AuthCard } from "@/components/account/AuthCard";
import { DemoEntryCard } from "@/components/account/DemoEntryCard";
import { LogoutButton } from "@/components/account/LogoutButton";
import { AppShell } from "@/components/site/AppShell";
import { auth, hasAnyUser } from "@/lib/auth";
import { isDemoConfigured } from "@/lib/demo/config";

export const metadata: Metadata = {
  title: "Konto",
};

export const dynamic = "force-dynamic";
// Der Demo-Einstieg baut beim ersten Besuch des Tages die Mock-Daten neu auf
// (siehe lib/demo/seed.ts) — das braucht mehr als die Default-Laufzeit.
export const maxDuration = 60;

// Konto-Seite: ausgeloggt → Anmelden/Registrieren (Registrierung nur,
// solange noch kein Konto existiert), eingeloggt → Konto-Übersicht.
// Alle anderen Seiten leitet der Proxy (src/proxy.ts) hierher um.
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    const allowSignUp = !(await hasAnyUser());
    const demoAvailable = isDemoConfigured();
    return (
      <AppShell>
        <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
          <header className="space-y-2 text-center">
            <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
              Konto
            </p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {allowSignUp ? "Konto erstellen" : "Anmelden"}
            </h1>
            <p className="mx-auto max-w-md text-base text-muted-foreground">
              {allowSignUp
                ? "Lege dein persönliches Konto an — damit sind deine Gesundheitsdaten ab sofort nur noch nach Anmeldung sichtbar."
                : "HealthOS ist geschützt. Melde dich an, um deine Daten zu sehen."}
            </p>
          </header>
          <AuthCard allowSignUp={allowSignUp} />
          {demoAvailable && (
            <>
              <div className="flex w-full max-w-md items-center gap-3">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs text-muted-foreground uppercase tracking-[0.18em]">
                  oder
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <DemoEntryCard />
            </>
          )}
        </main>
      </AppShell>
    );
  }

  const { user } = session;
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Konto
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            {user.name}
          </h1>
          <p className="text-base text-muted-foreground">
            Du bist angemeldet — alle Bereiche sind freigeschaltet.
          </p>
        </header>

        <div className="rounded-xl border border-border/60 bg-card p-6">
          <dl className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted-foreground">E-Mail</dt>
              <dd className="text-sm font-medium">{user.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Konto seit</dt>
              <dd className="text-sm font-medium">
                {user.createdAt.toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-border/60 pt-5">
            <LogoutButton />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Hinweis: Die Registrierung weiterer Konten ist deaktiviert, weil die
          App deine persönlichen Daten enthält.
        </p>
      </main>
    </AppShell>
  );
}
