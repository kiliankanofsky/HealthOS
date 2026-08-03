import {
  Calendar,
  type CalendarMarker,
  type CalendarTag,
} from "@/components/hypertrophy/Calendar";
import { NewSessionDialog } from "@/components/hypertrophy/NewSessionDialog";
import { NewTrainingUnitDialog } from "@/components/hypertrophy/NewTrainingUnitDialog";
import { RotationSection } from "@/components/hypertrophy/RotationSection";
import { OverviewAvatarPanel } from "@/components/hypertrophy/avatar/OverviewAvatarPanel";
import { AppShell } from "@/components/site/AppShell";
import { SyncNowSlot } from "@/components/site/SyncNowSlot";
import {
  getAllDailyTags,
  getAllExerciseNamesEverUsed,
  getAllSessions,
  getAllTemplates,
  getManageableTemplates,
} from "@/lib/db/queries";
import { getMuscleVolumeDetailBetween } from "@/lib/hypertrophy/volume";
import { templateVisuals } from "@/lib/hypertrophy/workouts";
import { toLocalISODate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";
// Der „Sync"-Button ruft die `syncNow`-Server-Action (6 Garmin/FDDB-Schritte +
// KI-Tagesnotiz) — die kann nah an 60s gehen. Page-Level maxDuration erbt auf
// die Server Action, sonst Default-Timeout → 504 → „unexpected response".
export const maxDuration = 60;

export default async function HypertrophyPage() {
  const templates = await getAllTemplates();
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const sessions = await getAllSessions();
  const markers: CalendarMarker[] = sessions
    .map((s) => {
      const t = templateById.get(s.templateId);
      if (!t) return null;
      // Marker zeigen Sessions ALLER Einheiten (auch archivierte) — die
      // Historie bleibt unabhängig von der aktuellen Rotation indiziert.
      return {
        date: s.date,
        color: t.color ?? null,
        name: t.name,
        templateSlug: t.slug,
      };
    })
    .filter((m): m is CalendarMarker => m !== null);

  // Übungs-Katalog (alle je benutzten Namen, inkl. getauschter) für den
  // "Neue Trainingseinheit"-Dialog.
  const exerciseNames = await getAllExerciseNamesEverUsed();

  // Einheiten für den "Neue Session"-Dialog (alle nicht-archivierten).
  const sessionUnits = (await getManageableTemplates()).map((t) => {
    const v = templateVisuals(t);
    return { slug: t.slug, name: t.name, color: t.color, letter: v.letter };
  });

  // Cheat-Day / Alkohol kommen aus daily_tags (Single Source of Truth).
  const tags: CalendarTag[] = (await getAllDailyTags())
    .filter((t) => t.cheatDay || t.alcohol)
    .map((t) => ({ date: t.date, cheatDay: t.cheatDay, alcohol: t.alcohol }));

  // Volumen-Tracker: gewichtete Sätze pro Muskelgruppe, rollierende 7 Tage.
  const todayIso = toLocalISODate();
  const weekAgo = new Date(`${todayIso}T00:00:00`);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const muscleVolume = await getMuscleVolumeDetailBetween(
    toLocalISODate(weekAgo),
    todayIso,
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Hypertrophy
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Gym Log
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            e1RM-Verlauf pro Satz, übungs-übergreifend getrackt. Garmin-Sync per `npm run db:sync:garmin`.
          </p>
          <div className="pt-2">
            <SyncNowSlot />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NewTrainingUnitDialog exerciseNames={exerciseNames} />
          <NewSessionDialog units={sessionUnits} />
        </div>
      </header>

      <RotationSection />

      {/*
        Kalender + Avatar nebeneinander auf Desktop (lg+, ⅔ / ⅓), gestapelt
        auf Mobile (Kalender oben, Avatar darunter).
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:col-span-2 lg:p-8">
          <Calendar markers={markers} tags={tags} />
        </section>
        <OverviewAvatarPanel
          volumeEntries={muscleVolume.map((v) => [v.muscle, v.sets])}
          exercisesByMuscleEntries={muscleVolume.map((v) => [
            v.muscle,
            v.exercises.map((e) => ({
              exerciseSlug: e.exerciseSlug,
              exerciseName: e.exerciseName,
              level: e.level,
              templateSlug: e.templateSlug,
              sets: e.sets,
            })),
          ])}
        />
      </div>
      </main>
    </AppShell>
  );
}
