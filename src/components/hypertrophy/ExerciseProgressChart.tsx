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
  // Tage, an denen dieser Slot durch eine andere Übung ersetzt war. Diese Tage
  // zählen NICHT zum Trend, werden aber als hohler Punkt auf der Brücken-Linie
  // zwischen den beiden validen Nachbar-Punkten markiert (analog /weight).
  swaps?: { date: string; name: string }[];
};

// Eine Linie pro Satz-Position (Satz 1, Satz 2, ...). Je tiefer der Index,
// desto heller die Farbe. Skipped Sets (reps=0) werden ausgefiltert ⇒ Lücke.
const SET_COLORS = ["#0F172A", "#475569", "#94A3B8", "#CBD5E1"];

type ChartRow = {
  date: string;
  isSwap: boolean;
  swapName: string | null;
  // dynamisch: set1, set2, ... mit e1RM-Wert (oder null bei skip/swap),
  // sowie set1Bridge, ... mit dem interpolierten Brücken-Wert über Tausch-Tage.
  [key: string]: number | string | boolean | null | undefined;
};

type SetMeta = {
  weightKg: number;
  reps: number;
  weightMode: "per-side" | "summed";
};

export function ExerciseProgressChart({ sets, unilateral, swaps }: Props) {
  const { rows, maxSetNumber, metaByDateAndSet, swapNameByDate } = useMemo(() => {
    const swapNameByDate = new Map<string, string>();
    for (const sw of swaps ?? []) swapNameByDate.set(sw.date, sw.name);

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
      // maxSet nur aus echten (nicht getauschten) Tagen ableiten, damit ein
      // Tausch-Tag mit mehr Sätzen keine sonst leere Extra-Linie erzeugt.
      if (!swapNameByDate.has(s.date) && s.setNumber > maxSet) maxSet = s.setNumber;
    }

    const dates = [...byDate.keys()].sort();
    const rows: ChartRow[] = dates.map((date) => {
      const day = byDate.get(date)!;
      const isSwap = swapNameByDate.has(date);
      const row: ChartRow = {
        date,
        isSwap,
        swapName: isSwap ? (swapNameByDate.get(date) ?? null) : null,
      };
      for (let n = 1; n <= maxSet; n++) {
        const meta = day.get(n);
        // Tausch-Tage aus dem Trend nehmen (Werte gehören zu anderer Übung).
        row[`set${n}`] =
          isSwap || !meta
            ? null
            : round1(
                effectiveE1RM({
                  weightKg: meta.weightKg,
                  reps: meta.reps,
                  weightMode: meta.weightMode,
                  unilateral,
                }),
              );
      }
      return row;
    });

    // Brücken-Linien: für jede Satz-Position ein einzelnes Segment exakt über
    // jeden Tausch-Tag, linear interpoliert zwischen den validen Nachbarn. Der
    // Indikator-Punkt sitzt am interpolierten Wert genau auf dieser Linie.
    const swapIndices = rows
      .map((r, i) => (r.isSwap ? i : -1))
      .filter((i) => i >= 0);
    if (swapIndices.length > 0) {
      for (let n = 1; n <= maxSet; n++) {
        const key = `set${n}`;
        for (const i of swapIndices) fillBridge(i, rows, key);
      }
    }

    return {
      rows,
      maxSetNumber: maxSet,
      metaByDateAndSet: byDate,
      swapNameByDate,
    };
  }, [sets, unilateral, swaps]);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
        Noch keine Daten für diese Übung. Logge ein paar Sätze, dann erscheint hier der Verlauf.
      </p>
    );
  }

  const hasSwaps = swapNameByDate.size > 0;

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
        <Legend max={maxSetNumber} hasSwaps={hasSwaps} />
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
                const dateStr = String(label);
                const swapName = swapNameByDate.get(dateStr);
                if (swapName !== undefined) {
                  return (
                    <div className="rounded-lg bg-card px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
                      <p className="mb-1 font-medium">{formatLong(dateStr)}</p>
                      <p className="text-muted-foreground">
                        Übung ausgetauscht{swapName ? `: ${swapName}` : ""}
                      </p>
                      <p className="text-muted-foreground/80">
                        zählt nicht zum Verlauf
                      </p>
                    </div>
                  );
                }
                const dayMeta = metaByDateAndSet.get(dateStr);
                return (
                  <div className="rounded-lg bg-card px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
                    <p className="mb-1 font-medium">{formatLong(dateStr)}</p>
                    {payload
                      .filter(
                        (p) =>
                          /^set\d+$/.test(String(p.dataKey)) &&
                          p.value !== null &&
                          p.value !== undefined,
                      )
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
            {/* Brücken-Linien (gestrichelt) über Tausch-Tage + Indikator-Punkt. */}
            {hasSwaps &&
              Array.from({ length: maxSetNumber }, (_, i) => i + 1).map((n, idx) => {
                const color = SET_COLORS[idx % SET_COLORS.length];
                return (
                  <Line
                    key={`bridge-${n}`}
                    type="monotone"
                    dataKey={`set${n}Bridge`}
                    stroke={color}
                    strokeOpacity={0.5}
                    strokeWidth={1.4}
                    strokeDasharray="4 4"
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={false}
                    legendType="none"
                    dot={(props: DotRenderProps) => {
                      const { cx, cy, payload, index } = props;
                      if (
                        payload?.isSwap !== true ||
                        typeof cx !== "number" ||
                        typeof cy !== "number"
                      ) {
                        return <g key={`b-${n}-${index}`} />;
                      }
                      // Hohler Ring = "hier wurde getauscht, kein echter Wert".
                      return (
                        <circle
                          key={`b-${n}-${index}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="white"
                          stroke={color}
                          strokeWidth={1.6}
                        />
                      );
                    }}
                  />
                );
              })}
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

type DotRenderProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: ChartRow;
};

// Setzt Brücken-Werte für eine einzelne Tausch-Position `i` einer Satz-Linie:
// linear interpolierter Wert an `i`, identische Anker-Werte bei prev/next, alle
// übrigen Slots bleiben undefined. So zeichnet Recharts (connectNulls=false)
// genau ein Segment über die Lücke — ohne dass die gestrichelte Linie woanders
// durchscheint. Der Punkt an `i` liegt damit exakt auf der Verbindungslinie.
function fillBridge(i: number, rows: ChartRow[], key: string): void {
  const bkey = `${key}Bridge`;
  const valueAt = (j: number): number | null => {
    const v = rows[j][key];
    return typeof v === "number" ? v : null;
  };
  let prev = i - 1;
  while (prev >= 0 && valueAt(prev) === null) prev--;
  let next = i + 1;
  while (next < rows.length && valueAt(next) === null) next++;
  const prevV = prev >= 0 ? valueAt(prev) : null;
  const nextV = next < rows.length ? valueAt(next) : null;
  if (prevV !== null && nextV !== null) {
    const t = (i - prev) / (next - prev);
    rows[i][bkey] = prevV + (nextV - prevV) * t;
    rows[prev][bkey] = prevV;
    rows[next][bkey] = nextV;
  } else if (prevV !== null) {
    rows[i][bkey] = prevV;
    rows[prev][bkey] = prevV;
  } else if (nextV !== null) {
    rows[i][bkey] = nextV;
    rows[next][bkey] = nextV;
  }
}

function Legend({ max, hasSwaps }: { max: number; hasSwaps: boolean }) {
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
      {hasSwaps && (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full border-[1.6px] border-muted-foreground/70 bg-white"
          />
          <span className="text-muted-foreground">getauscht</span>
        </span>
      )}
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
