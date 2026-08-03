import { Tag } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/site/AppShell";
import { NutritionChartSection } from "@/components/nutrition/NutritionChartSection";
import { NutritionCorrelationView } from "@/components/nutrition/NutritionCorrelationView";
import { NutritionRecommendationCard } from "@/components/nutrition/NutritionRecommendationCard";
import { SyncNowSlot } from "@/components/site/SyncNowSlot";
import { WeightChartSection } from "@/components/weight/WeightChartSection";
import { WeightEntryForm } from "@/components/weight/WeightEntryForm";
import { WeightStatCards } from "@/components/weight/WeightStats";
import {
  getAllDailyTags,
  getAllPhases,
  getAllWeightEntries,
  getDailyActivityEntries,
  getNutritionEntries,
} from "@/lib/db/queries";
import { toLocalISODate } from "@/lib/utils/date";
import {
  buildMaintenanceEstimate,
  buildNutritionRecommendation,
} from "@/lib/utils/nutrition-recommendation";
import { computeWeightStats } from "@/lib/utils/weight-stats";

export const dynamic = "force-dynamic";
// Der „Sync"-Button ruft die `syncNow`-Server-Action (6 Garmin/FDDB-Schritte +
// KI-Tagesnotiz) — die kann nah an 60s gehen. Page-Level maxDuration erbt auf
// die Server Action, sonst Default-Timeout → 504 → „unexpected response".
export const maxDuration = 60;

export default async function WeightPage() {
  const all = await getAllWeightEntries();
  const phases = await getAllPhases();
  const tags = await getAllDailyTags();
  const stats = computeWeightStats(all);
  const nutrition = await getNutritionEntries({ source: "fddb" });
  const activity = await getDailyActivityEntries({ source: "garmin" });
  const todayIso = toLocalISODate();
  const recommendation = buildNutritionRecommendation({
    weightEntries: all,
    phases,
    nutrition,
    tags,
    todayIso,
  });
  // TDEE-Bilanz-Schätzung — nur in der Maintenance-Phase gerendert, aber
  // günstig genug, immer zu berechnen (rein lokale Aggregation).
  const maintenance = buildMaintenanceEstimate({
    weightEntries: all,
    nutrition,
    tags,
    activity,
    todayIso,
  });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
      <header className="space-y-2">
        <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
          Weight
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Gewicht
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Tägliche Messungen, Phasen, Tags.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <SyncNowSlot />
          <Link
            href="/weight/tags"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted/70 hover:-translate-y-0.5"
          >
            <Tag className="size-3.5" />
            Tags
          </Link>
        </div>
      </header>

      <WeightStatCards stats={stats} />

      <Section>
        <WeightChartSection entries={all} phases={phases} tags={tags} />
      </Section>

      <Section
        title="Neuen Eintrag hinzufügen"
        description="Datum + Gewicht. Bestehender Eintrag desselben Datums wird überschrieben."
      >
        <WeightEntryForm defaultDate={toLocalISODate()} />
      </Section>

      <Link
        href="/weight/entries"
        className="group block rounded-3xl bg-muted/60 p-6 ring-1 ring-black/5 transition-all hover:bg-muted hover:ring-black/10 sm:p-8 lg:p-10"
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

      <header className="space-y-2 pt-6">
        <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
          Weight · Ernährung
        </p>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Nutrition
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Kalorien und Makros aus fddb.info. Klick auf einen Tag im Chart, um
          Details + Bilanz mit Garmin-Verbrauch zu sehen.
        </p>
      </header>

      <Section
        title="Kalorien-Empfehlung"
        description="Kalorische Anpassung für deine aktuelle Phase — abgeleitet aus der Gewichts-Rate der laufenden Phase und deinem Ø-Intake."
      >
        <NutritionRecommendationCard rec={recommendation} maintenance={maintenance} />
      </Section>

      <Section>
        <NutritionChartSection
          entries={nutrition}
          weightEntries={all}
          tags={tags}
          activity={activity}
        />
      </Section>

      <Section
        title="Energiebilanz"
        description="Aufgenommene Kalorien (fddb) vs. verbrauchte Kalorien (Garmin) im Vergleich zum Gewicht."
      >
        <NutritionCorrelationView
          nutrition={nutrition}
          weight={all}
          tags={tags}
          activity={activity}
        />
      </Section>
      </main>
    </AppShell>
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
