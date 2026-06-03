import type { SplitsResult } from "@/lib/endurance/plan-splits";
import { formatPace } from "@/lib/endurance/plan";
import { cn } from "@/lib/utils";

// Balken-Grafik der geplanten Splits. Längerer Balken = schnellere Pace.
// Links die hochgezählte Nummer (km bzw. Runde), rechts die Ziel-Pace.
// Schnellste Splits (Work-Intervalle) werden rot hervorgehoben.

const KIND_BAR: Record<string, string> = {
  work: "bg-foreground/70",
  warmup: "bg-foreground/25",
  recovery: "bg-foreground/20",
  cooldown: "bg-foreground/25",
};

export function SplitsChart({ result }: { result: SplitsResult }) {
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
        <span>{result.mode === "km" ? "Kilometer" : "Runde"}</span>
        <span>Pace</span>
      </div>
      <div className="space-y-1">
        {result.splits.map((s) => {
          // Geschwindigkeit ∝ 1/Pace → schnellster Split = voller Balken.
          const frac = Math.max(0.12, minPace / s.paceSec);
          return (
            <div key={s.index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {s.index}
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded">
                <div
                  className={cn(
                    "h-full rounded",
                    s.isFastest ? "bg-red-500" : (KIND_BAR[s.kind] ?? "bg-foreground/40"),
                  )}
                  style={{ width: `${frac * 100}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-xs tabular-nums",
                  s.isFastest ? "font-semibold text-red-600" : "text-foreground",
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
