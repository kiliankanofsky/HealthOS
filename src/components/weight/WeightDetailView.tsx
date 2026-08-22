"use client";

import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WeightDayDetailDialog } from "./WeightDayDetailDialog";
import { WeightDayList } from "./WeightDayList";
import { WeightWeekMatrix } from "./WeightWeekMatrix";
import type {
  DailyTag,
  NutritionEntry,
  NutritionExclusion,
  WeightEntry,
} from "@/lib/db/schema";

type View = "day" | "week";

type Props = {
  entries: WeightEntry[];
  tags: DailyTag[];
  nutrition: NutritionEntry[];
  exclusions: NutritionExclusion[];
  matrixYear: number;
};

export function WeightDetailView({
  entries,
  tags,
  nutrition,
  exclusions,
  matrixYear,
}: Props) {
  const [view, setView] = useState<View>("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, WeightEntry>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  const tagByDate = useMemo(() => {
    const m = new Map<string, DailyTag>();
    for (const t of tags) m.set(t.date, t);
    return m;
  }, [tags]);

  const selectedEntry = selectedDate ? byDate.get(selectedDate) ?? null : null;
  const selectedTag = selectedDate ? tagByDate.get(selectedDate) ?? null : null;

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
        <WeightDayList
          entries={entries}
          tags={tags}
          onOpenDay={setSelectedDate}
        />
      ) : (
        <WeightWeekMatrix
          entries={entries}
          tags={tags}
          nutrition={nutrition}
          exclusions={exclusions}
          year={matrixYear}
          onOpenDay={setSelectedDate}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Klick auf einen Tag öffnet die Detailansicht zum Bearbeiten.
      </p>

      <WeightDayDetailDialog
        open={selectedDate !== null}
        date={selectedDate}
        entry={selectedEntry}
        tag={selectedTag}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}
