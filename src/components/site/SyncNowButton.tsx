"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { syncNow } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SyncResult, SyncSummary } from "@/lib/integrations/sync-all";

// Manueller Sync-Trigger. Ruft dieselbe Logik wie der tägliche Cron auf,
// hilfreich wenn der morgendliche Cron noch partielle Daten gesehen hat
// (Garmin-Aggregations-Verzögerung, FDDB-Cookie-Race) und du jetzt frische
// Daten in der DB haben willst.
export function SyncNowButton({ label = "Sync" }: { label?: string } = {}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const summary = await syncNow();
        setResult(summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={isPending}
        >
          <RefreshCw
            className={cn("size-4", isPending && "animate-spin")}
            aria-hidden
          />
          {isPending ? "Synce…" : label}
        </Button>
        {result && <SyncStatusPill summary={result} />}
        {error && <span className="text-xs text-rose-600">Fehler: {error}</span>}
      </div>

      {/* Immer sichtbares Feld: was hat der Sync verändert. */}
      {result && <ChangesField changes={result.changes} />}
    </div>
  );
}

// Komprimiertes Status-Pill statt fünf Einzel-Chips. Details on-hover im title.
function SyncStatusPill({ summary }: { summary: SyncSummary }) {
  const { results } = summary;
  const entries: { label: string; result: SyncResult }[] = [
    { label: "Strength", result: results.garminStrength },
    { label: "Kalorien", result: results.garminCalories },
    { label: "Läufe", result: results.garminRuns },
    { label: "Metrics", result: results.garminMetrics },
    { label: "Plan-Match", result: results.planMatch },
    { label: "FDDB", result: results.nutrition },
  ];
  const failed = entries.filter((e) => !e.result.ok);
  const detail = entries
    .map((e) => `${e.result.ok ? "✓" : "✗"} ${e.label}${e.result.ok ? "" : `: ${(e.result as { error: string }).error}`}`)
    .join("\n");

  if (summary.ok) {
    return (
      <span
        title={detail}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
      >
        <CheckCircle2 className="size-3.5" aria-hidden />
        Sync successful
      </span>
    );
  }
  return (
    <span
      title={detail}
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
    >
      <AlertTriangle className="size-3.5" aria-hidden />
      Sync mit Fehlern ({failed.length})
    </span>
  );
}

function ChangesField({ changes }: { changes: string[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="space-y-0.5 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      {changes.map((c, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span aria-hidden className="mt-px text-foreground/40">
            ·
          </span>
          <span>{c}</span>
        </li>
      ))}
    </ul>
  );
}
