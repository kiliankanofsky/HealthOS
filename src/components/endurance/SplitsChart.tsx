import type { SplitsResult } from "@/lib/endurance/plan-splits";
import { formatPace } from "@/lib/endurance/plan";
import { cn } from "@/lib/utils";

// Balken-Grafik der geplanten Splits.
//   LÄNGE (horizontal) = Pace  → längerer Balken = schnellere Pace.
//   DICKE (Höhe)       = Distanz → 3 km doppelt-/dreifach so dick wie 1 km.
// Links die hochgezählte Nummer (km bzw. Runde), rechts die Ziel-Pace.
// `highlightFastest`: schnellste Splits rot hervorheben (für Recovery/Easy aus).

const KIND_BAR: Record<string, string> = {
  work: "bg-foreground/70",
  warmup: "bg-foreground/25",
  recovery: "bg-foreground/20",
  cooldown: "bg-foreground/25",
};

// Dicke pro Kilometer (px) + Grenzen, damit sehr kurze/lange Segmente lesbar bleiben.
const PX_PER_KM = 14;
const MIN_BAR_H = 6;
const MAX_BAR_H = 44;

export function SplitsChart({
  result,
  highlightFastest = true,
}: {
  result: SplitsResult;
  highlightFastest?: boolean;
}) {
  if (result.splits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Pace-Daten für diese Session.
      </p>
    );
  }

  const minPace = Math.min(...result.splits.map((s) => s.paceSec));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>
          {result.mode === "km"
            ? "Kilometer"
            : result.mode === "laps"
              ? "Runde"
              : "km · Runden"}
        </span>
        <span>Pace</span>
      </div>
      <div className="space-y-1">
        {result.splits.map((s) => {
          // Länge ∝ Geschwindigkeit (schnellster Split = voller Balken).
          const frac = Math.max(0.12, minPace / s.paceSec);
          // Dicke ∝ Distanz (km).
          const height = Math.min(
            MAX_BAR_H,
            Math.max(MIN_BAR_H, Math.round((s.meters / 1000) * PX_PER_KM)),
          );
          const isHot = highlightFastest && s.isFastest;
          return (
            <div key={s.index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {s.index}
              </span>
              <div className="flex flex-1 items-center">
                <div
                  className={cn(
                    "rounded",
                    isHot ? "bg-red-500" : (KIND_BAR[s.kind] ?? "bg-foreground/40"),
                  )}
                  style={{ width: `${frac * 100}%`, height: `${height}px` }}
                />
              </div>
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-xs tabular-nums",
                  isHot ? "font-semibold text-red-600" : "text-foreground",
                )}
              >
                {formatPace(s.paceSec)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
