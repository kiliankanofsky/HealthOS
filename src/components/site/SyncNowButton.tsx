"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { syncNow } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SyncSummary } from "@/lib/integrations/sync-all";

// Manueller Sync-Trigger. Ruft dieselbe Logik wie der tägliche Cron auf,
// hilfreich wenn der morgendliche Cron noch partielle Daten gesehen hat
// (Garmin-Aggregations-Verzögerung, FDDB-Cookie-Race) und du jetzt frische
// Daten in der DB haben willst.
export function SyncNowButton({ label = "Sync jetzt" }: { label?: string } = {}) {
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
      {result && <SyncResultBadge summary={result} />}
      {error && <span className="text-xs text-rose-600">Fehler: {error}</span>}
    </div>
  );
}

function SyncResultBadge({ summary }: { summary: SyncSummary }) {
  const { results } = summary;
  const entries: { label: string; result: typeof results.sheets }[] = [
    { label: "Sheets", result: results.sheets },
    { label: "Strength", result: results.garminStrength },
    { label: "Kalorien", result: results.garminCalories },
    { label: "FDDB", result: results.nutrition },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {entries.map(({ label, result }) => (
        <span
          key={label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
            result.ok
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700",
          )}
          title={result.ok ? formatOkDetail(result) : result.error}
        >
          <span aria-hidden>{result.ok ? "✓" : "✗"}</span>
          {label}
        </span>
      ))}
    </div>
  );
}

function formatOkDetail(result: { ok: true; [k: string]: unknown }): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(result)) {
    if (k === "ok") continue;
    parts.push(`${k}: ${String(v)}`);
  }
  return parts.join(", ");
}
