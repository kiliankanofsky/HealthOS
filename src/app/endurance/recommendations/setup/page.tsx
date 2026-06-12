import Link from "next/link";

import { PlanSetupForm } from "@/components/endurance/PlanSetupForm";
import { AppShell } from "@/components/site/AppShell";

export const dynamic = "force-dynamic";

export default function PlanSetupPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[840px] space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Endurance · Goal-Race-Plan
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Plan anlegen
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Race-Ziel definieren, Volumen festlegen, Referenz-PDF hochladen. Die
            Wochen-Struktur wird daraus automatisch generiert; die KI füllt sie
            in Sprint 3 mit Sessions.
          </p>
          <p className="pt-2 text-xs">
            <Link
              href="/endurance/recommendations"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← Zurück
            </Link>
          </p>
        </header>

        <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-10">
          <PlanSetupForm />
        </section>
      </main>
    </AppShell>
  );
}
