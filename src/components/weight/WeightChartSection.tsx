"use client";

import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WeightChart } from "./WeightChart";

type Range = "1w" | "4w" | "8w" | "3m" | "max";

const OPTIONS: { value: Range; label: string }[] = [
  { value: "1w", label: "Woche" },
  { value: "4w", label: "4 Wochen" },
  { value: "8w", label: "8 Wochen" },
  { value: "3m", label: "3 Monate" },
  { value: "max", label: "Max" },
];

const DAYS_BY_RANGE: Record<Range, number | null> = {
  "1w": 7,
  "4w": 28,
  "8w": 56,
  "3m": 90,
  max: null,
};

type ChartPoint = { date: string; weight: number };

type Props = {
  data: ChartPoint[];
};

export function WeightChartSection({ data }: Props) {
  const [range, setRange] = useState<Range>("4w");

  const filtered = useMemo(() => {
    const days = DAYS_BY_RANGE[range];
    if (days === null) return data;
    if (data.length === 0) return data;

    // Stichtag = Datum des letzten Eintrags. So zeigt das Diagramm immer den
    // tatsächlichen Datenbereich, auch wenn der letzte Eintrag älter als heute ist.
    const lastDate = data[data.length - 1].date;
    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - (days - 1));

    return data.filter((point) => new Date(point.date) >= cutoff);
  }, [data, range]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Verlauf
        </p>
        <SegmentedControl
          options={OPTIONS}
          value={range}
          onChange={setRange}
          size="sm"
        />
      </div>
      <WeightChart data={filtered} />
    </div>
  );
}
