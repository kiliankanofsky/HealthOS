import Link from "next/link";

import {
  getAllSessions,
  getAllTemplates,
  getAllWeightEntries,
  getSetsBySession,
  getTemplateExercises,
} from "@/lib/db/queries";
import { modulesBySlug } from "@/lib/site";
import { bestE1RM, round1 } from "@/lib/utils/strength";
import { cn } from "@/lib/utils";

// "Heute in HealthOS" — drei Kacheln mit aktuellen Live-Daten aus der DB,
// inspiriert vom Adidas-Editorial-Layout darunter.
export async function PulseSection() {
  const [weight, hyper, endurance] = await Promise.all([
    readWeightPulse(),
    readHypertrophyPulse(),
    readEndurancePulse(),
  ]);

  return (
    <section className="mx-auto w-full max-w-[1440px] px-5 py-14 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
      <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
            Heute
          </p>
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Aktueller Stand
          </h2>
        </div>
        <Link
          href="/weight"
          className="hidden text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          Alle Daten →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PulseCard {...weight} />
        <PulseCard {...hyper} />
        <PulseCard {...endurance} />
      </div>
    </section>
  );
}

type PulseCardProps = {
  module: "weight" | "hypertrophy" | "endurance";
  eyebrow: string;
  title: string;
  body: string;
  metrics?: { label: string; value: string }[];
  href: string;
  available: boolean;
  accent: string;
};

function PulseCard({
  module,
  eyebrow,
  title,
  body,
  metrics,
  href,
  available,
  accent,
}: PulseCardProps) {
  const cfg = modulesBySlug.get(module);
  const inner = (
    <article
      className={cn(
        "group relative flex h-full flex-col gap-5 overflow-hidden rounded-3xl bg-card p-6 ring-1 ring-foreground/10 transition-all duration-300 ease-out sm:p-7",
        available && "hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.18)] hover:ring-foreground/15",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{
          background: `linear-gradient(90deg, ${cfg?.gradientFrom ?? accent} 0%, ${cfg?.gradientTo ?? accent} 100%)`,
        }}
      />

      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.16em] uppercase",
            available
              ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20"
              : "bg-muted text-muted-foreground ring-1 ring-border",
          )}
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", available ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {available ? "Live" : "Soon"}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>

      {metrics && metrics.length > 0 && (
        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border/50 pt-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <dt className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                {m.label}
              </dt>
              <dd className="mt-1 font-heading text-xl font-semibold tabular-nums tracking-tight">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {available && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] uppercase text-foreground/80 transition-colors group-hover:text-foreground">
          Öffnen
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      )}
    </article>
  );

  if (!available) {
    return <div className="cursor-not-allowed select-none">{inner}</div>;
  }
  return (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-3xl">
      {inner}
    </Link>
  );
}

// ---- Daten lesen (Server-Side, weil das ein Server Component ist) ----

async function readWeightPulse(): Promise<PulseCardProps> {
  const cfg = modulesBySlug.get("weight")!;
  const entries = await getAllWeightEntries();
  if (entries.length === 0) {
    return {
      module: "weight",
      eyebrow: cfg.label,
      title: "Noch keine Daten",
      body: "Sobald du Gewichte loggst oder syncst, erscheint hier dein Trend.",
      href: cfg.href,
      available: cfg.available,
      accent: cfg.gradientTo,
    };
  }
  const latest = entries[entries.length - 1];
  const sevenDaysAgo = entries
    .slice()
    .reverse()
    .find((e) => daysBetween(e.date, latest.date) >= 7);
  const delta = sevenDaysAgo ? latest.weightKg - sevenDaysAgo.weightKg : null;
  return {
    module: "weight",
    eyebrow: cfg.label,
    title: cfg.hint,
    body: `Letzter Eintrag am ${formatShort(latest.date)}. ${entries.length} Messungen insgesamt.`,
    metrics: [
      {
        label: "Aktuell",
        value: `${latest.weightKg.toFixed(1).replace(".", ",")} kg`,
      },
      {
        label: "Δ 7 Tage",
        value:
          delta === null
            ? "—"
            : `${delta > 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")} kg`,
      },
    ],
    href: cfg.href,
    available: cfg.available,
    accent: cfg.gradientTo,
  };
}

async function readHypertrophyPulse(): Promise<PulseCardProps> {
  const cfg = modulesBySlug.get("hypertrophy")!;
  const sessions = await getAllSessions();
  if (sessions.length === 0) {
    return {
      module: "hypertrophy",
      eyebrow: cfg.label,
      title: "Noch kein Workout",
      body: "Logge deine erste Session manuell oder über `npm run db:sync:garmin`.",
      href: cfg.href,
      available: cfg.available,
      accent: cfg.gradientTo,
    };
  }
  const templates = await getAllTemplates();
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const last = sessions[0]; // desc
  const tpl = templateById.get(last.templateId);
  const tplExercises = tpl ? await getTemplateExercises(tpl.id) : [];
  const unilateralByTplExId = new Map(
    tplExercises.map((row) => [row.templateExercise.id, row.exercise.unilateral]),
  );
  const lastSets = await getSetsBySession(last.id);
  const byEx = new Map<
    number,
    { weightKg: number; reps: number; weightMode: "per-side" | "summed"; unilateral: boolean }[]
  >();
  for (const s of lastSets) {
    const list = byEx.get(s.templateExerciseId) ?? [];
    list.push({
      weightKg: s.weightKg,
      reps: s.reps,
      weightMode: s.weightMode,
      unilateral: unilateralByTplExId.get(s.templateExerciseId) ?? false,
    });
    byEx.set(s.templateExerciseId, list);
  }
  let totalE1 = 0;
  for (const sets of byEx.values()) {
    const best = bestE1RM(sets);
    if (best !== null) totalE1 += best;
  }
  return {
    module: "hypertrophy",
    eyebrow: cfg.label,
    title: cfg.hint,
    body: `Zuletzt ${tpl?.name ?? "Workout"} am ${formatShort(last.date)}. ${sessions.length} Sessions geloggt.`,
    metrics: [
      { label: "Σ e1RM", value: `${round1(totalE1).toString().replace(".", ",")} kg` },
      { label: "Sätze", value: String(lastSets.filter((s) => s.reps > 0).length) },
    ],
    href: cfg.href,
    available: cfg.available,
    accent: cfg.gradientTo,
  };
}

async function readEndurancePulse(): Promise<PulseCardProps> {
  const cfg = modulesBySlug.get("endurance")!;
  return {
    module: "endurance",
    eyebrow: cfg.label,
    title: "Bald verfügbar",
    body: cfg.description,
    href: cfg.href,
    available: cfg.available,
    accent: cfg.gradientTo,
  };
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function formatShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
}
