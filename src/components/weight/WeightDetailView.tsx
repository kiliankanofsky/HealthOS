"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WeightDayList } from "./WeightDayList";
import { WeightWeekMatrix } from "./WeightWeekMatrix";
import type { WeightEntry } from "@/lib/db/schema";

type View = "day" | "week";

type Props = {
  entries: WeightEntry[];
  matrixYear: number;
};

export function WeightDetailView({ entries, matrixYear }: Props) {
  const [view, setView] = useState<View>("day");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {view === "day" ? "Tag-für-Tag" : `Wochen-Matrix · ${matrixYear}`}
        </p>
        <SegmentedControl<View>
          options={[
            { value: "day", label: "Tag" },
            { value: "week", label: "Woche" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "day" ? (
        <WeightDayList entries={entries} />
      ) : (
        <WeightWeekMatrix entries={entries} year={matrixYear} />
      )}

      <p className="text-xs text-muted-foreground">
        Klick auf einen Wert zum Bearbeiten · Enter zum Speichern · Esc zum Abbrechen ·
        leeres Feld + Enter löscht den Eintrag.
      </p>
    </div>
  );
}
