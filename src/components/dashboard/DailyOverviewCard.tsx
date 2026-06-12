"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { generateOverviewAction } from "@/app/actions";
import { cn } from "@/lib/utils";

// Agent Overview: drei tägliche KI-Bewertungen (Endurance/Hypertrophy/Weight).
// Normalfall: der Cron hat den heutigen Eintrag schon geschrieben.
// Self-Heal: fehlt er (overview=null), generiert die Card ihn beim Mount
// selbst nach und refresht — dafür braucht sie Client-State.

export type OverviewData = {
  enduranceText: string;
  hypertrophyText: string;
  weightText: string;
};

type Props = {
  overview: OverviewData | null;
};

const SECTIONS = [
  { key: "enduranceText", kicker: "Endurance", href: "/endurance" },
  { key: "hypertrophyText", kicker: "Hypertrophy", href: "/hypertrophy" },
  { key: "weightText", kicker: "Weight", href: "/weight" },
] as const;

export function DailyOverviewCard({ overview }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Self-Heal nur EINMAL pro Mount versuchen — sonst Endlos-Schleife,
  // wenn die Generierung dauerhaft fehlschlägt (z.B. API-Key fehlt).
  const attemptedRef = useRef(false);

  function generate(force: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await generateOverviewAction(force);
      if (!r.ok) {
        setError(r.error ?? "Generierung fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  }

  useEffect(() => {
    if (overview === null && !attemptedRef.current) {
      attemptedRef.current = true;
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Agent Overview
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tägliche Einordnung deiner drei Bereiche — abgestimmt auf deine
            Performance- und Recovery-Werte, aktualisiert über den Daily-Sync.
          </p>
        </div>
        <button
          type="button"
          onClick={() => generate(true)}
          disabled={pending}
          title="Neu generieren"
          aria-label="Overview neu generieren"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", pending && "animate-spin")} />
        </button>
      </div>

      <div className="mt-4 flex-1">
        {overview === null ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
            {pending || !error ? (
              <>
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Tagesübersicht wird generiert…
                </p>
              </>
            ) : (
              <>
                <Sparkles className="size-5 text-muted-foreground/60" />
                <p className="max-w-sm text-sm text-red-600">{error}</p>
                <button
                  type="button"
                  onClick={() => generate(false)}
                  className="mt-1 rounded-full border border-foreground/15 px-4 py-1.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted"
                >
                  Erneut versuchen
                </button>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {SECTIONS.map((s) => (
              <li key={s.key} className="py-3.5 first:pt-0 last:pb-0">
                <Link
                  href={s.href}
                  className="text-[10px] font-medium tracking-[0.2em] text-primary uppercase transition-colors hover:text-primary/70"
                >
                  {s.kicker}
                </Link>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                  {overview[s.key]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {overview !== null && error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
