import {
  Calendar,
  type CalendarMarker,
  type CalendarTag,
} from "@/components/hypertrophy/Calendar";
import { NewSessionDialog } from "@/components/hypertrophy/NewSessionDialog";
import { WorkoutCards } from "@/components/hypertrophy/WorkoutCards";
import { OverviewAvatarPanel } from "@/components/hypertrophy/avatar/OverviewAvatarPanel";
import { AppShell } from "@/components/site/AppShell";
import { SyncNowButton } from "@/components/site/SyncNowButton";
import {
  getAllSessions,
  getAllTemplates,
  getAllWeightEntries,
} from "@/lib/db/queries";
import type { WorkoutKind } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function HypertrophyPage() {
  const templates = await getAllTemplates();
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const sessions = await getAllSessions();
  const markers: CalendarMarker[] = sessions
    .map((s) => {
      const t = templateById.get(s.templateId);
      if (!t) return null;
      return {
        date: s.date,
        kind: t.kind as WorkoutKind,
        templateSlug: t.slug,
      };
    })
    .filter((m): m is CalendarMarker => m !== null);

  // Cheat-Day / Alkohol kommen aus weight_entries (Single Source of Truth).
  const tags: CalendarTag[] = (await getAllWeightEntries())
    .filter((e) => e.cheatDay || e.alcohol)
    .map((e) => ({ date: e.date, cheatDay: e.cheatDay, alcohol: e.alcohol }));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-10 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Hypertrophy
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
            Gym Log
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Drei Workouts, e1RM-Verlauf pro Satz, Garmin-Sync per `npm run db:sync:garmin`.
          </p>
          <div className="pt-2">
            <SyncNowButton />
          </div>
        </div>
        <NewSessionDialog />
      </header>

      <WorkoutCards />

      {/*
        Kalender + Avatar nebeneinander auf Desktop (lg+, ⅔ / ⅓), gestapelt
        auf Mobile (Kalender oben, Avatar darunter).
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:col-span-2 lg:p-8">
          <Calendar markers={markers} tags={tags} />
        </section>
        <OverviewAvatarPanel />
      </div>
      </main>
    </AppShell>
  );
}
