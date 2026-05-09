"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteSet, saveSet, toggleSetWeightMode } from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import type { WeightMode, WorkoutSet } from "@/lib/db/schema";
import { effectiveE1RM, round1 } from "@/lib/utils/strength";
import { cn } from "@/lib/utils";

export type ExerciseLogRow = {
  templateExerciseId: number;
  name: string;
  unilateral: boolean;
  repMin: number;
  repMax: number;
  sets: WorkoutSet[];
};

type Props = {
  sessionId: number;
  exerciseRows: ExerciseLogRow[];
};

// Auto-Save-Logger: pro Set zwei Inputs (Gewicht / Reps), Speichern beim Blur.
// Optimistic update — wir merken uns den lokalen State und revidieren nur bei Fehler.
export function SessionLogger({ sessionId, exerciseRows }: Props) {
  return (
    <div className="space-y-4">
      {exerciseRows.map((row) => (
        <ExerciseCard key={row.templateExerciseId} row={row} sessionId={sessionId} />
      ))}
    </div>
  );
}

type DraftSet = {
  // Persistierte ID (oder null bei noch nicht gespeicherten Reihen).
  id: number | null;
  setNumber: number;
  weight: string;
  reps: string;
  weightMode: WeightMode;
};

function setsToDraft(sets: WorkoutSet[]): DraftSet[] {
  if (sets.length === 0) {
    // Default: 2 leere Zeilen.
    return [
      { id: null, setNumber: 1, weight: "", reps: "", weightMode: "per-side" },
      { id: null, setNumber: 2, weight: "", reps: "", weightMode: "per-side" },
    ];
  }
  return sets.map((s) => ({
    id: s.id,
    setNumber: s.setNumber,
    weight: s.weightKg.toString().replace(".", ","),
    reps: String(s.reps),
    weightMode: s.weightMode,
  }));
}

function ExerciseCard({
  row,
  sessionId,
}: {
  row: ExerciseLogRow;
  sessionId: number;
}) {
  const [drafts, setDrafts] = useState<DraftSet[]>(() => setsToDraft(row.sets));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (idx: number, patch: Partial<DraftSet>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  };

  const persist = (idx: number) => {
    const d = drafts[idx];
    const wTrimmed = d.weight.trim().replace(",", ".");
    const rTrimmed = d.reps.trim();
    if (wTrimmed === "" && rTrimmed === "") return; // beide leer = nicht speichern
    const weight = Number(wTrimmed);
    const reps = Number(rTrimmed);
    if (!Number.isFinite(weight) || !Number.isFinite(reps)) {
      setError("Bitte Zahlen eingeben.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveSet({
        sessionId,
        templateExerciseId: row.templateExerciseId,
        setNumber: d.setNumber,
        weightKg: weight,
        reps,
        weightMode: d.weightMode,
      });
      if (!result.ok) setError(result.error ?? "Speichern fehlgeschlagen.");
    });
  };

  const flipMode = (idx: number) => {
    const d = drafts[idx];
    const next: WeightMode = d.weightMode === "summed" ? "per-side" : "summed";
    update(idx, { weightMode: next });
    if (d.id === null) return; // noch nicht persistiert — wird beim nächsten Save mitgegeben.
    setError(null);
    startTransition(async () => {
      const result = await toggleSetWeightMode({ setId: d.id! });
      if (!result.ok) setError(result.error ?? "Mode-Wechsel fehlgeschlagen.");
    });
  };

  const addRow = () => {
    setDrafts((prev) => [
      ...prev,
      {
        id: null,
        setNumber: (prev[prev.length - 1]?.setNumber ?? 0) + 1,
        weight: "",
        reps: "",
        weightMode: "per-side",
      },
    ]);
  };

  const removeRow = (idx: number) => {
    const d = drafts[idx];
    if (d.id === null) {
      // Lokal-only — einfach aus dem State werfen.
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm(`Satz ${d.setNumber} löschen?`)) return;
    startTransition(async () => {
      await deleteSet({ setId: d.id! });
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
    });
  };

  return (
    <div className="space-y-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-lg font-semibold tracking-tight">
          {row.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {row.repMin}–{row.repMax} Reps
          {row.unilateral && " · einarmig"}
        </p>
      </div>

      <div
        className={cn(
          "grid items-center gap-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase",
          row.unilateral
            ? "grid-cols-[2.25rem_1fr_2rem_1fr_auto_2rem]"
            : "grid-cols-[2.25rem_1fr_1fr_auto_2rem]",
        )}
      >
        <span>Satz</span>
        <span>Gewicht</span>
        {row.unilateral && <span className="text-center">Modus</span>}
        <span>Reps</span>
        <span className="text-right">e1RM</span>
        <span />
      </div>

      <div className="space-y-1.5">
        {drafts.map((d, idx) => {
          const w = Number(d.weight.replace(",", "."));
          const r = Number(d.reps);
          const e1 =
            Number.isFinite(w) && Number.isFinite(r)
              ? effectiveE1RM({
                  weightKg: w,
                  reps: r,
                  weightMode: d.weightMode,
                  unilateral: row.unilateral,
                })
              : 0;
          const skipped = Number.isFinite(r) && r === 0 && d.reps !== "";
          return (
            <div
              key={`${d.id ?? "new"}-${d.setNumber}`}
              className={cn(
                "grid items-center gap-2 rounded-lg px-1 py-1",
                row.unilateral
                  ? "grid-cols-[2.25rem_1fr_2rem_1fr_auto_2rem]"
                  : "grid-cols-[2.25rem_1fr_1fr_auto_2rem]",
                skipped && "opacity-60",
              )}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                {d.setNumber}
              </span>
              <NumberInput
                value={d.weight}
                placeholder="kg"
                onChange={(v) => update(idx, { weight: v })}
                onBlur={() => persist(idx)}
              />
              {row.unilateral && (
                <ModeButton
                  mode={d.weightMode}
                  onClick={() => flipMode(idx)}
                  disabled={pending}
                />
              )}
              <NumberInput
                value={d.reps}
                placeholder="Reps"
                onChange={(v) => update(idx, { reps: v })}
                onBlur={() => persist(idx)}
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                {e1 > 0 ? round1(e1) : "—"}
              </span>
              <button
                type="button"
                aria-label="Satz löschen"
                onClick={() => removeRow(idx)}
                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                disabled={pending}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {row.unilateral && (
        <p className="pt-1 text-[10px] text-muted-foreground/80">
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">P</kbd>{" "}
          Hantel-Gewicht pro Arm (Default).{" "}
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">S</kbd>{" "}
          Beidseitig summiert — Score halbiert intern.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" size="sm" onClick={addRow} disabled={pending}>
          <Plus className="size-3.5" />
          Satz
        </Button>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  mode,
  onClick,
  disabled,
}: {
  mode: WeightMode;
  onClick: () => void;
  disabled?: boolean;
}) {
  const isSummed = mode === "summed";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        isSummed
          ? "Summiert — Klick wechselt zu Pro Seite"
          : "Pro Seite — Klick wechselt zu Summiert"
      }
      aria-label={`Weight-Mode: ${isSummed ? "summiert" : "pro Seite"}`}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
        isSummed
          ? "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 hover:bg-amber-500/20"
          : "bg-muted text-muted-foreground/80 ring-1 ring-transparent hover:bg-muted-foreground/10 hover:text-foreground",
      )}
    >
      {isSummed ? "S" : "P"}
    </button>
  );
}

function NumberInput({
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
    />
  );
}
