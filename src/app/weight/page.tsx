import Link from "next/link";
import { WeightChartSection } from "@/components/weight/WeightChartSection";
import { WeightEntryForm } from "@/components/weight/WeightEntryForm";
import { WeightStatCards } from "@/components/weight/WeightStats";
import { getAllPhases, getAllWeightEntries } from "@/lib/db/queries";
import { toLocalISODate } from "@/lib/utils/date";
import { computeWeightStats } from "@/lib/utils/weight-stats";

export const dynamic = "force-dynamic";

export default function WeightPage() {
  const all = getAllWeightEntries();
  const phases = getAllPhases();
  const stats = computeWeightStats(all);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-6 py-10 lg:px-10 lg:py-14">
      <header className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground"
        >
          ← Übersicht
        </Link>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Weight
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
            Gewicht
          </h1>
        </div>
      </header>

      <WeightStatCards stats={stats} />

      <Section>
        <WeightChartSection entries={all} phases={phases} />
      </Section>

      <Section
        title="Neuen Eintrag hinzufügen"
        description="Datum + Gewicht. Bestehender Eintrag desselben Datums wird überschrieben."
      >
        <WeightEntryForm defaultDate={toLocalISODate()} />
      </Section>

      <Link
        href="/weight/entries"
        className="group block rounded-3xl bg-muted/60 p-8 ring-1 ring-black/5 transition-all hover:bg-muted hover:ring-black/10 lg:p-10"
      >
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Alle Einträge
            </p>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Detaillierte Ansicht
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Tag-für-Tag-Liste oder Wochen-Matrix. Einträge bearbeiten, ergänzen oder löschen.
            </p>
          </div>
          <span
            aria-hidden
            className="text-2xl text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
          >
            →
          </span>
        </div>
      </Link>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
      {(title || description) && (
        <div className="mb-5 space-y-1">
          {title && (
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
