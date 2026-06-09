"use client";

import { Check, Plus, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  clearExerciseOverride,
  deleteSet,
  saveExerciseOverride,
  saveSet,
  toggleSetWeightMode,
} from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import type { WeightMode, WorkoutSet } from "@/lib/db/schema";
import { effectiveE1RM, round1 } from "@/lib/utils/strength";
import { cn } from "@/lib/utils";

export type PreviousSetRef = {
  setNumber: number;
  weightKg: number;
  reps: number;
};

export type ExerciseLogRow = {
  templateExerciseId: number;
  name: string;
  // Slug der Stamm-Übung des Slots — für den Link zur Übungs-Verlauf-Seite.
  exerciseSlug: string;
  // Wenn gesetzt, steht der alternative Name; "name" bleibt der Slot-Default.
  overrideName: string | null;
  unilateral: boolean;
  repMin: number;
  repMax: number;
  sets: WorkoutSet[];
  // Sätze aus dem letzten vergleichbaren Training (gleiche Übung), keyed via setNumber.
  previousSets: { date: string; sets: PreviousSetRef[] } | null;
};

type Props = {
  sessionId: number;
  templateSlug: string;
  exerciseRows: ExerciseLogRow[];
};

// Auto-Save-Logger: pro Set zwei Inputs (Gewicht / Reps), Speichern beim Blur.
// Optimistic update — wir merken uns den lokalen State und revidieren nur bei Fehler.
export function SessionLogger({ sessionId, templateSlug, exerciseRows }: Props) {
  return (
    <div className="space-y-4">
      {exerciseRows.map((row) => (
        <ExerciseCard
          key={row.templateExerciseId}
          row={row}
          sessionId={sessionId}
          templateSlug={templateSlug}
        />
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
  templateSlug,
}: {
  row: ExerciseLogRow;
  sessionId: number;
  templateSlug: string;
}) {
  const [drafts, setDrafts] = useState<DraftSet[]>(() => setsToDraft(row.sets));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Override-State: Edit-Mode (Input offen) und lokaler Name-Buffer.
  const [editingOverride, setEditingOverride] = useState(false);
  const [overrideDraft, setOverrideDraft] = useState("");

  const isOverridden = row.overrideName !== null;
  const displayName = row.overrideName ?? row.name;

  // Vorherige Sätze für schnellen Lookup per setNumber.
  const previousBySetNumber = useMemo(() => {
    const m = new Map<number, PreviousSetRef>();
    if (!row.previousSets) return m;
    for (const s of row.previousSets.sets) m.set(s.setNumber, s);
    return m;
  }, [row.previousSets]);

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
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm(`Satz ${d.setNumber} löschen?`)) return;
    startTransition(async () => {
      await deleteSet({ setId: d.id! });
      setDrafts((prev) => prev.filter((_, i) => i !== idx));
    });
  };

  const saveOverride = () => {
    setError(null);
    const trimmed = overrideDraft.trim();
    if (trimmed.length === 0) {
      // Leerer Name = Override löschen (zurück zur Original-Übung).
      startTransition(async () => {
        await clearExerciseOverride({
          sessionId,
          templateExerciseId: row.templateExerciseId,
        });
        setEditingOverride(false);
      });
      return;
    }
    startTransition(async () => {
      const result = await saveExerciseOverride({
        sessionId,
        templateExerciseId: row.templateExerciseId,
        name: trimmed,
      });
      if (!result.ok) {
        setError(result.error ?? "Override speichern fehlgeschlagen.");
        return;
      }
      setEditingOverride(false);
    });
  };

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl p-5 ring-1 ring-foreground/10",
        // Overridden Cards leicht gräulich abgesetzt, damit der Slot-Swap
        // auf einen Blick sichtbar ist.
        isOverridden ? "bg-muted/55" : "bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingOverride ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={overrideDraft}
                onChange={(e) => setOverrideDraft(e.target.value)}
                placeholder={`Alternative für ${row.name}`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveOverride();
                  if (e.key === "Escape") {
                    setOverrideDraft(row.overrideName ?? "");
                    setEditingOverride(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1 font-heading text-lg font-semibold tracking-tight outline-none focus:ring-2 focus:ring-ring/40"
              />
              <button
                type="button"
                onClick={saveOverride}
                disabled={pending}
                aria-label="Übernehmen"
                className="inline-flex size-7 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-500/10"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverrideDraft(row.overrideName ?? "");
                  setEditingOverride(false);
                }}
                aria-label="Abbrechen"
                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <h3 className="font-heading text-lg font-semibold tracking-tight">
                <Link
                  href={`/hypertrophy/${templateSlug}/exercise/${row.exerciseSlug}`}
                  className="decoration-1 underline-offset-4 hover:underline"
                  title={`Verlauf von ${row.name} ansehen`}
                >
                  {displayName}
                </Link>
              </h3>
              {isOverridden && (
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  statt {row.name}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {row.repMin}–{row.repMax} Reps
            {row.unilateral && " · einarmig"}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (isOverridden) {
                // Bereits überschrieben → ein Klick setzt zurück zur Original-Übung.
                setError(null);
                startTransition(async () => {
                  await clearExerciseOverride({
                    sessionId,
                    templateExerciseId: row.templateExerciseId,
                  });
                });
                return;
              }
              // Noch original → Input öffnen, leer beginnen.
              setOverrideDraft("");
              setEditingOverride(true);
            }}
            aria-label={
              isOverridden ? "Auf Original-Übung zurücksetzen" : "Alternative Übung wählen"
            }
            title={
              isOverridden
                ? `Klick: zurück zu „${row.name}“`
                : "Alternative Übung wählen"
            }
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full transition-colors",
              isOverridden
                ? "bg-foreground/10 text-foreground ring-1 ring-foreground/15 hover:bg-foreground/15"
                : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
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
          const previous = previousBySetNumber.get(d.setNumber) ?? null;
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
              <span className="flex items-center justify-end gap-1.5">
                <SetDiffChip
                  currentWeight={d.weight}
                  currentReps={d.reps}
                  previous={previous}
                  previousDate={row.previousSets?.date ?? null}
                />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                  {e1 > 0 ? round1(e1) : "—"}
                </span>
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

// Pro-Satz-Diff: vergleicht den aktuellen Satz mit dem gleich-nummerierten Satz
// aus dem letzten vergleichbaren Training. Zeigt Gewichts-Δ zuerst; bei
// gleichem Gewicht das Reps-Δ. Bei fehlenden Eingaben oder ohne Baseline: nichts.
function SetDiffChip({
  currentWeight,
  currentReps,
  previous,
  previousDate,
}: {
  currentWeight: string;
  currentReps: string;
  previous: PreviousSetRef | null;
  previousDate: string | null;
}) {
  if (!previous) return null;
  const w = Number(currentWeight.replace(",", "."));
  const r = Number(currentReps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || r === 0) return null;
  const dWeight = Math.round((w - previous.weightKg) * 10) / 10;
  const dReps = r - previous.reps;
  const title = `Vorher: ${previous.weightKg} kg × ${previous.reps}${
    previousDate ? ` (${previousDate})` : ""
  }`;

  let text: string;
  let tone: "up" | "down" | "flat";
  if (dWeight > 0) {
    text = `+${dWeight} kg`;
    tone = "up";
  } else if (dWeight < 0) {
    text = `${dWeight} kg`;
    tone = "down";
  } else if (dReps > 0) {
    text = `+${dReps}`;
    tone = "up";
  } else if (dReps < 0) {
    text = `${dReps}`;
    tone = "down";
  } else {
    text = "±0";
    tone = "flat";
  }
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1",
        tone === "up" && "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25",
        tone === "down" && "bg-rose-500/10 text-rose-700 ring-rose-500/20",
        tone === "flat" && "bg-muted text-muted-foreground ring-transparent",
      )}
    >
      {text}
    </span>
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
