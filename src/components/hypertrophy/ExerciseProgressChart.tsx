"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SetWithDate } from "@/lib/db/queries";
import { effectiveE1RM, round1 } from "@/lib/utils/strength";

type Props = {
  sets: SetWithDate[];
  unilateral?: boolean;
};

// Eine Linie pro Satz-Position (Satz 1, Satz 2, ...). Je tiefer der Index,
// desto heller die Farbe. Skipped Sets (reps=0) werden ausgefiltert ⇒ Lücke.
const SET_COLORS = ["#0F172A", "#475569", "#94A3B8", "#CBD5E1"];

type ChartRow = {
  date: string;
  // dynamisch: set1, set2, ... mit e1RM-Wert (oder null bei skip)
  [key: string]: number | string | null;
};

type SetMeta = {
  weightKg: number;
  reps: number;
  weightMode: "per-side" | "summed";
};

export function ExerciseProgressChart({ sets, unilateral }: Props) {
  const { rows, maxSetNumber, metaByDateAndSet } = useMemo(() => {
    // Pro Datum: e1RM und Roh-Set-Werte je Satz-Position sammeln.
    // Score nutzt effectiveE1RM — bei summed-Mode halbiert sich's intern.
    const byDate = new Map<string, Map<number, SetMeta>>();
    let maxSet = 0;
    for (const s of sets) {
      if (s.reps <= 0) continue;
      const dayMap = byDate.get(s.date) ?? new Map<number, SetMeta>();
      dayMap.set(s.setNumber, {
        weightKg: s.weightKg,
        reps: s.reps,
        weightMode: s.weightMode,
      });
      byDate.set(s.date, dayMap);
      if (s.setNumber > maxSet) maxSet = s.setNumber;
    }
    const dates = [...byDate.keys()].sort();
    const rows: ChartRow[] = dates.map((date) => {
      const day = byDate.get(date)!;
      const row: ChartRow = { date };
      for (let n = 1; n <= maxSet; n++) {
        const meta = day.get(n);
        row[`set${n}`] = meta
          ? round1(
              effectiveE1RM({
                weightKg: meta.weightKg,
                reps: meta.reps,
                weightMode: meta.weightMode,
                unilateral,
              }),
            )
          : null;
      }
      return row;
    });
    return { rows, maxSetNumber: maxSet, metaByDateAndSet: byDate };
  }, [sets, unilateral]);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
        Noch keine Daten für diese Übung. Logge ein paar Sätze, dann erscheint hier der Verlauf.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          e1RM-Verlauf pro Satz
          {unilateral && (
            <span className="ml-2 text-[10px] tracking-normal normal-case text-muted-foreground/70">
              · Gewicht summiert (beide Seiten)
            </span>
          )}
        </p>
        <Legend max={maxSetNumber} />
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 8, left: -16 }}
          >
            <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)" }}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const dayMeta = metaByDateAndSet.get(String(label));
                return (
                  <div className="rounded-lg bg-card px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
                    <p className="mb-1 font-medium">{formatLong(String(label))}</p>
                    {payload
                      .filter((p) => p.value !== null && p.value !== undefined)
                      .map((p) => {
                        const setNum = Number(String(p.dataKey).replace("set", ""));
                        const meta = dayMeta?.get(setNum);
                        return (
                          <div key={p.dataKey as string} className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block size-2 rounded-full"
                              style={{ background: p.color }}
                            />
                            <span className="text-muted-foreground">Satz {setNum}:</span>
                            <span className="tabular-nums">
                              {meta
                                ? `${meta.weightKg.toString().replace(".", ",")} kg${meta.weightMode === "summed" ? " (S)" : ""} × ${meta.reps}`
                                : "—"}
                            </span>
                            <span className="text-muted-foreground">
                              → e1RM {round1(p.value as number)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                );
              }}
            />
            {Array.from({ length: maxSetNumber }, (_, i) => i + 1).map((n, idx) => (
              <Line
                key={n}
                type="monotone"
                dataKey={`set${n}`}
                stroke={SET_COLORS[idx % SET_COLORS.length]}
                strokeWidth={1.6}
                dot={{ r: 2.5, strokeWidth: 0, fill: SET_COLORS[idx % SET_COLORS.length] }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ max }: { max: number }) {
  if (max === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {Array.from({ length: max }, (_, i) => i + 1).map((n, idx) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded"
            style={{ background: SET_COLORS[idx % SET_COLORS.length] }}
          />
          <span className="text-muted-foreground">Satz {n}</span>
        </span>
      ))}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
