import Link from "next/link";
import { AppShell } from "@/components/site/AppShell";
import { WeightDetailView } from "@/components/weight/WeightDetailView";
import { getAllWeightEntries } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function WeightEntriesPage() {
  const entries = await getAllWeightEntries();
  const matrixYear = new Date().getFullYear();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-8 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <header className="space-y-3">
          <Link
            href="/weight"
            className="inline-flex items-center gap-1 text-xs tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
          >
            ← Gewicht
          </Link>
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
              Alle Einträge
            </p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
              Detaillierte Ansicht
            </h1>
          </div>
        </header>

        <WeightDetailView entries={entries} matrixYear={matrixYear} />
      </main>
    </AppShell>
  );
}
