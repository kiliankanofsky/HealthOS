"use client";

import { ChevronDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Range = "1w" | "4w" | "12w" | "6m" | "max";

export const RANGE_OPTIONS: {
  value: Range;
  label: string;
  daysBack: number | null;
}[] = [
  { value: "1w", label: "1 Woche", daysBack: 7 },
  { value: "4w", label: "4 Wochen", daysBack: 28 },
  { value: "12w", label: "12 Wochen", daysBack: 84 },
  { value: "6m", label: "6 Monate", daysBack: 182 },
  { value: "max", label: "Max", daysBack: null },
];

export const RANGE_TITLE: Record<Range, string> = {
  "1w": "Diese Woche",
  "4w": "Letzte 4 Wochen",
  "12w": "Letzte 12 Wochen",
  "6m": "Letzte 6 Monate",
  max: "Gesamt",
};

/** ISO-Date des frühesten Tages im gewählten Zeitraum, oder null für "Max". */
export function getCutoffIso(range: Range): string | null {
  const opt = RANGE_OPTIONS.find((o) => o.value === range);
  if (!opt || opt.daysBack == null) return null;
  const d = new Date();
  d.setDate(d.getDate() - opt.daysBack + 1);
  return d.toISOString().slice(0, 10);
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const current = RANGE_OPTIONS.find((o) => o.value === value);
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
          "text-muted-foreground ring-1 ring-border",
          "transition-colors hover:bg-muted hover:text-foreground",
        )}
      >
        {current?.label ?? "—"}
        <ChevronDown className="size-3 opacity-70" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-auto min-w-[9rem] gap-0 p-1"
      >
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "w-full rounded px-3 py-1.5 text-left text-sm transition-colors",
              value === opt.value
                ? "bg-foreground/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
