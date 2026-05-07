"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
};

// Apple-style Segmented Control:
// - Container mit grauem Pill-Background
// - Aktives Segment: weißer Pill mit dezentem Schatten
// - Inaktive Segmente: muted-foreground, hover dunkler
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: Props<T>) {
  const padding = size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm";

  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center rounded-full bg-muted/80 p-1 ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full font-medium transition-all duration-150",
              padding,
              active
                ? "bg-white text-foreground shadow-sm dark:bg-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
