import Link from "next/link";
import { WeightDetailView } from "@/components/weight/WeightDetailView";
import { getAllWeightEntries } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function WeightEntriesPage() {
  const entries = getAllWeightEntries();
  const matrixYear = new Date().getFullYear();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10 lg:px-10 lg:py-14">
      <header className="space-y-3">
        <Link
          href="/weight"
          className="inline-flex items-center gap-1 text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground"
        >
          ← Gewicht
        </Link>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Alle Einträge
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
            Detaillierte Ansicht
          </h1>
        </div>
      </header>

      <WeightDetailView entries={entries} matrixYear={matrixYear} />
    </main>
  );
}
