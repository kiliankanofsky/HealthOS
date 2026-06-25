"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import {
  addExerciseToUnit,
  removeExerciseFromUnit,
  reorderUnitExercises,
  setExerciseDefaultSets,
} from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export type UnitSlot = {
  templateExerciseId: number;
  name: string;
  slug: string;
  repMin: number;
  repMax: number;
  defaultSets: number | null;
};

// Übungen einer bestehenden Einheit verwalten: hinzufügen (aus Katalog oder
// neu), entfernen (sofern keine Sätze geloggt) und sortieren. Mutationen laufen
// gegen Server-Actions; router.refresh() synchronisiert die Seite.
export function UnitExerciseManager({
  templateId,
  slots,
  exerciseNames,
}: {
  templateId: number;
  slots: UnitSlot[];
  exerciseNames: string[];
}) {
  const router = useRouter();
  const datalistId = useId();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<UnitSlot[]>(slots);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newMin, setNewMin] = useState(8);
  const [newMax, setNewMax] = useState(12);
  const [newSets, setNewSets] = useState(3);

  // Satz-Vorgabe eines bestehenden Slots ändern (optimistisch + Server-Action).
  const changeSets = (slot: UnitSlot, value: number) => {
    const sets = Math.max(1, Math.min(20, Math.round(value)));
    setList((prev) =>
      prev.map((x) =>
        x.templateExerciseId === slot.templateExerciseId
          ? { ...x, defaultSets: sets }
          : x,
      ),
    );
    startTransition(async () => {
      await setExerciseDefaultSets({
        templateExerciseId: slot.templateExerciseId,
        defaultSets: sets,
      });
      router.refresh();
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setList(slots);
    setError(null);
    setOpen(next);
  };

  const move = (id: number, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.templateExerciseId === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    setError(null);
    startTransition(async () => {
      await reorderUnitExercises({
        orderedTemplateExerciseIds: next.map((x) => x.templateExerciseId),
      });
      router.refresh();
    });
  };

  const remove = (slot: UnitSlot) => {
    if (!confirm(`„${slot.name}" aus dieser Einheit entfernen?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeExerciseFromUnit({
        templateExerciseId: slot.templateExerciseId,
      });
      if (!res.ok) {
        setError(res.error ?? "Entfernen fehlgeschlagen.");
        return;
      }
      setList((prev) =>
        prev.filter((x) => x.templateExerciseId !== slot.templateExerciseId),
      );
      router.refresh();
    });
  };

  const add = () => {
    const name = newName.trim();
    if (!name) {
      setError("Bitte eine Übung wählen oder benennen.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addExerciseToUnit({
        templateId,
        name,
        repMin: newMin,
        repMax: newMax,
        defaultSets: newSets,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setList((prev) => [...prev, res.slot]);
      setNewName("");
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => handleOpenChange(true)}>
        <Pencil className="size-3.5" />
        Übungen verwalten
      </Button>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="max-w-xl">
            <Dialog.CloseIconButton />
            <Dialog.Header
              title="Übungen verwalten"
              description="Übungen hinzufügen, entfernen oder sortieren. Übungen mit bereits geloggten Sätzen lassen sich nicht entfernen."
            />

            <div className="space-y-2">
              {list.map((slot, idx) => (
                <div
                  key={slot.templateExerciseId}
                  className="flex items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Nach oben"
                      disabled={idx === 0 || pending}
                      onClick={() => move(slot.templateExerciseId, -1)}
                      className="text-muted-foreground/50 hover:text-foreground disabled:opacity-25"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Nach unten"
                      disabled={idx === list.length - 1 || pending}
                      onClick={() => move(slot.templateExerciseId, 1)}
                      className="text-muted-foreground/50 hover:text-foreground disabled:opacity-25"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{slot.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {slot.repMin}–{slot.repMax} Reps
                    </p>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Sätze
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={slot.defaultSets ?? 3}
                      disabled={pending}
                      onChange={(e) => changeSets(slot, Number(e.target.value))}
                      className="w-12 rounded-md border border-border bg-background px-1.5 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Übung entfernen"
                    disabled={pending}
                    onClick={() => remove(slot)}
                    className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {list.length === 0 && (
                <p className="rounded-lg bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
                  Noch keine Übungen.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Übung hinzufügen
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  list={datalistId}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Übung wählen oder neu benennen"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newSets}
                    aria-label="Sätze"
                    title="Sätze"
                    onChange={(e) => setNewSets(Number(e.target.value))}
                    className="w-12 rounded-md border border-border bg-background px-1.5 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  ×
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newMin}
                    aria-label="Reps min"
                    onChange={(e) => setNewMin(Number(e.target.value))}
                    className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  –
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newMax}
                    aria-label="Reps max"
                    onChange={(e) => setNewMax(Number(e.target.value))}
                    className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </span>
                <Button size="sm" onClick={add} disabled={pending}>
                  <Plus className="size-3.5" />
                  Hinzufügen
                </Button>
              </div>
              <datalist id={datalistId}>
                {exerciseNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={() => setOpen(false)}>
                Fertig
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
