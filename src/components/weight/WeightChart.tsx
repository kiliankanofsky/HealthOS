"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useRef } from "react";

import type { WeightPhase } from "@/lib/db/schema";
import type { SmoothPoint } from "@/lib/utils/loess";

export type ChartPoint = {
  date: string;
  weight: number;
  cheatDay?: boolean;
  alcohol?: boolean;
  cheatMeal?: boolean;
};

type Props = {
  data: ChartPoint[];
  smoothed: SmoothPoint[] | null;
  phases: WeightPhase[];
  showTags: boolean;
  dense?: boolean;
  onOpenDay?: (date: string) => void;
  onOpenPhase?: (phase: WeightPhase) => void;
};

const SYSTEM_BLUE = "#007AFF";
const SMOOTH_COLOR = "rgba(140, 140, 140, 0.55)"; // dezenter grauer Trend
const TAG_COLOR = "#E11D48"; // rose-600

// Apple-Phasen-Farbgebung: violett für Aufbau, türkis für Defizit, amber für
// Erhaltung (klar von Defizit abgesetzt, nicht neutralgrau).
const PHASE_FILL: Record<WeightPhase["kind"], string> = {
  bulk: "rgba(139, 92, 246, 0.10)", // violet-500
  cut: "rgba(20, 184, 166, 0.10)", // teal-500
  maintenance: "rgba(245, 158, 11, 0.12)", // amber-500
};

export function WeightChart({
  data,
  smoothed,
  phases,
  showTags,
  dense = false,
  onOpenDay,
  onOpenPhase,
}: Props) {
  // Merge: jedem Datenpunkt ggf. den geglätteten Wert zuordnen, damit beide
  // Linien dieselbe x-Achse teilen (categorical "date").
  const merged = useMemo(() => {
    if (!smoothed) return data.map((d) => ({ ...d, smoothed: undefined }));
    const map = new Map(smoothed.map((s) => [s.date, s.smoothed]));
    return data.map((d) => ({ ...d, smoothed: map.get(d.date) }));
  }, [data, smoothed]);

  // Phasen auf den sichtbaren Bereich klippen: ReferenceArea braucht konkrete
  // Werte, die im X-Achsen-Domain (= unsere Datumswerte) vorkommen.
  const clippedPhases = useMemo(() => {
    if (data.length === 0 || phases.length === 0) return [];
    const dates = data.map((d) => d.date);
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    return phases
      .map((p) => {
        const start = p.startDate < firstDate ? firstDate : p.startDate;
        const end =
          !p.endDate || p.endDate > lastDate ? lastDate : p.endDate;
        // Auf Datumswerte snappen, die tatsächlich im Datensatz sind.
        const x1 = dates.find((d) => d >= start) ?? null;
        const x2 = [...dates].reverse().find((d) => d <= end) ?? null;
        if (!x1 || !x2 || x1 > x2) return null;
        return { id: p.id, kind: p.kind, x1, x2 };
      })
      .filter((p): p is { id: number; kind: WeightPhase["kind"]; x1: string; x2: string } => p !== null);
  }, [phases, data]);

  // Pending-Phase-Klick: ReferenceArea setzt die Phase, der LineChart-Handler
  // entscheidet danach anhand der Cursor-Nähe zur Linie, ob doch der Tages-
  // Dialog gewinnt. So zählt die ReferenceArea zuerst, hat aber kein Veto.
  const pendingPhaseRef = useRef<WeightPhase | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const phaseById = useMemo(() => {
    const m = new Map<number, WeightPhase>();
    for (const p of phases) m.set(p.id, p);
    return m;
  }, [phases]);

  // Lookup: Datum → Gewicht. Nötig, um die Y-Position der Linie für einen
  // angeklickten Tag selbst zu berechnen.
  const weightByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data) m.set(d.date, d.weight);
    return m;
  }, [data]);

  // Erst NACH allen Hooks aussteigen — ein früher Return oberhalb würde die
  // Hook-Reihenfolge zwischen leerem und gefülltem Zeitfenster verändern.
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
        Keine Daten vorhanden.
      </div>
    );
  }

  const weights = data.map((d) => d.weight);
  const min = Math.floor(Math.min(...weights) - 0.5);
  const max = Math.ceil(Math.max(...weights) + 0.5);

  return (
    <div ref={wrapperRef} className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={merged}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          onClick={(state, event) => {
            const pendingPhase = pendingPhaseRef.current;
            pendingPhaseRef.current = null;

            const label = state?.activeLabel;
            if (typeof label !== "string") {
              if (pendingPhase && onOpenPhase) onOpenPhase(pendingPhase);
              return;
            }

            // Cursor-Y relativ zur Wrapper-Höhe.
            const e = event as React.MouseEvent | undefined;
            const rect = wrapperRef.current?.getBoundingClientRect();
            const cursorY =
              e && rect && typeof e.clientY === "number"
                ? e.clientY - rect.top
                : null;

            // Datenpunkt-Y selbst berechnen: Plot-Bereich ist von oben (top=8)
            // bis containerHöhe - X-Achsen-Höhe (~30) - bottom margin (8).
            // Die Y-Achse mapped `max` auf top und `min` auf bottom.
            const containerH = rect?.height ?? 320;
            const plotTop = 8;
            const plotBottom = containerH - 30 - 8;
            const plotH = Math.max(1, plotBottom - plotTop);
            const weight = weightByDate.get(label);
            const pointY =
              typeof weight === "number" && max > min
                ? plotTop + ((max - weight) / (max - min)) * plotH
                : null;

            // Schwellwert in Pixeln. ~32px deckt Linien-Strich + großzügige
            // Klick-Toleranz ab, ohne dass mittlere Phasen-Hintergründe schon
            // mitzählen.
            const onLine =
              cursorY !== null && pointY !== null && Math.abs(cursorY - pointY) <= 32;

            if (onLine) {
              if (onOpenDay) onOpenDay(label);
              return;
            }
            if (pendingPhase && onOpenPhase) {
              onOpenPhase(pendingPhase);
              return;
            }
            if (onOpenDay) onOpenDay(label);
          }}
          style={onOpenDay || onOpenPhase ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid stroke="currentColor" opacity={0.07} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => formatTickDate(value)}
            minTickGap={32}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${v}`}
          />

          {clippedPhases.map((p) => (
            <ReferenceArea
              key={p.id}
              x1={p.x1}
              x2={p.x2}
              y1={min}
              y2={max}
              fill={PHASE_FILL[p.kind]}
              stroke="none"
              ifOverflow="visible"
              style={onOpenPhase ? { cursor: "pointer" } : undefined}
              onClick={() => {
                // Setzt nur den Pending-State; ob die Phase tatsächlich öffnet,
                // entscheidet danach der LineChart-Handler (Linien-Nähe schlägt
                // Phase).
                const original = phaseById.get(p.id);
                if (original) pendingPhaseRef.current = original;
              }}
            />
          ))}

          <Tooltip
            cursor={{ stroke: SYSTEM_BLUE, strokeOpacity: 0.2, strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
            labelFormatter={(label) => formatLabelDate(String(label))}
            formatter={(value, name) => {
              const v = Number(value);
              const label = name === "smoothed" ? "Trend" : "Gewicht";
              return [Number.isFinite(v) ? `${v.toFixed(1)} kg` : "–", label];
            }}
          />

          {smoothed && (
            <Line
              type="monotone"
              dataKey="smoothed"
              stroke={SMOOTH_COLOR}
              strokeWidth={1.75}
              strokeDasharray="0"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}

          <Line
            type="monotone"
            dataKey="weight"
            stroke={SYSTEM_BLUE}
            strokeWidth={dense ? 1.4 : 2}
            dot={(props: DotRenderProps) => {
              const { cx, cy, payload, index } = props;
              const isTag =
                showTags &&
                (payload?.cheatDay === true ||
                  payload?.alcohol === true ||
                  payload?.cheatMeal === true);
              if (!isTag) {
                return <g key={`d-${index}`} />;
              }
              return (
                <circle
                  key={`d-${index}`}
                  cx={cx}
                  cy={cy}
                  r={4.4}
                  fill={TAG_COLOR}
                  stroke="white"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type DotRenderProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: ChartPoint & { smoothed?: number };
};

function formatTickDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function formatLabelDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
