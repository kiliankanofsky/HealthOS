import { cn } from "@/lib/utils";

// "This Week"-Card im Stil des Figma-Mockups: drei große Kennzahlen,
// 7-Tage-Balkenreihe (Mo–So) und eine Zeilen-Liste pro Trainingstag.
// Rein präsentational — Running- und Gym-Variante füttern nur andere Daten.

export type TotalsStat = { label: string; value: string; unit?: string };
export type TotalsBar = { label: string; value: number; display: string };
export type TotalsRow = { label: string; value: string };

type Props = {
  heading: string; // "Running" / "Gym"
  stats: TotalsStat[];
  bars: TotalsBar[]; // genau 7 (Mo–So)
  rows: TotalsRow[];
  totalRow: TotalsRow | null;
};

export function TotalsCard({ heading, stats, bars, rows, totalRow }: Props) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {heading}
        </p>
        <h3 className="font-heading text-2xl font-semibold tracking-tight">
          This Week
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {s.label}
            </p>
            <p className="mt-1 font-heading text-2xl font-semibold tabular-nums leading-none">
              {s.value}
              {s.unit && (
                <span className="ml-0.5 align-super text-[10px] font-medium text-muted-foreground">
                  {s.unit}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Balkenreihe Mo–So — Höhe proportional zum Wochen-Maximum. */}
      <div>
        <div className="flex h-20 items-end justify-between gap-1.5">
          {bars.map((b, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end">
              <div
                className={cn(
                  "w-full rounded-sm",
                  b.value > 0 ? "bg-foreground/70" : "bg-muted",
                )}
                style={{
                  height: b.value > 0 ? `${Math.max((b.value / max) * 100, 8)}%` : "3px",
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between gap-1.5">
          {bars.map((b, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[9px] font-medium tracking-wide text-muted-foreground uppercase tabular-nums"
            >
              {b.display}
            </span>
          ))}
        </div>
      </div>

      {(rows.length > 0 || totalRow) && (
        <div className="border-t border-border/60 pt-3">
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {r.label}
                </span>
                <span className="font-heading font-semibold tabular-nums">
                  {r.value}
                </span>
              </li>
            ))}
            {totalRow && (
              <li className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2 text-sm">
                <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {totalRow.label}
                </span>
                <span className="font-heading text-base font-semibold tabular-nums">
                  {totalRow.value}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
