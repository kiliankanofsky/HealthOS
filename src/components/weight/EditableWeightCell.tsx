"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setWeightForDate } from "@/app/weight/actions";
import { cn } from "@/lib/utils";

type Props = {
  date: string;
  weightKg: number | null;
  // Visuelle Variante: "cell" für Matrix-Zelle, "row" für Listen-Zeile.
  variant?: "cell" | "row";
  className?: string;
};

export function EditableWeightCell({
  date,
  weightKg,
  variant = "cell",
  className,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const display = weightKg === null ? "—" : weightKg.toFixed(1);

  const startEdit = () => {
    setDraft(weightKg === null ? "" : weightKg.toFixed(1).replace(".", ","));
    setError(null);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // Leerer Wert: Eintrag löschen, falls vorhanden.
      startTransition(async () => {
        const result = await setWeightForDate(date, null);
        if (!result.ok) setError(result.error ?? "Fehler");
        else setEditing(false);
      });
      return;
    }
    const value = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || value > 500) {
      setError("Ungültig");
      return;
    }
    startTransition(async () => {
      const result = await setWeightForDate(date, value);
      if (!result.ok) {
        setError(result.error ?? "Fehler");
        return;
      }
      setEditing(false);
    });
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  if (editing) {
    return (
      <div className={cn("relative", className)}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          disabled={pending}
          className={cn(
            "w-full rounded-md bg-background text-right text-sm tabular-nums outline-none ring-2 ring-primary/40 focus:ring-primary",
            variant === "cell" ? "px-2 py-1" : "px-3 py-1.5",
          )}
          placeholder="kg"
        />
        {error && (
          <span className="absolute -bottom-4 right-0 text-[10px] text-red-600">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className={cn(
        "w-full rounded-md text-right text-sm tabular-nums transition-colors",
        weightKg === null
          ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60"
          : "text-foreground hover:bg-muted/60",
        variant === "cell" ? "px-2 py-1" : "px-3 py-1.5",
        pending && "opacity-50",
        className,
      )}
    >
      {display}
    </button>
  );
}
