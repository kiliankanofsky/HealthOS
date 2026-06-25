"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import {
  createTrainingUnit,
  type UnitExerciseInput,
} from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PALETTE_KEYS, TEMPLATE_PALETTE } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";

type Props = {
  // Alle je benutzten Übungs-Namen (Stamm-Übungen ∪ getauschte) — Autocomplete.
  exerciseNames: string[];
};

type Row = UnitExerciseInput & { key: number };

let rowSeq = 1;
function blankRow(): Row {
  return { key: rowSeq++, name: "", repMin: 8, repMax: 12, unilateral: false, defaultSets: 3 };
}

// "Neue Trainingseinheit": legt eine wiederverwendbare Einheit an (Name + Farbe
// + Übungen mit Rep-Bereichen). Übungen werden aus dem Gesamt-Katalog gewählt
// (inkl. getauschter) ODER neu benannt — neue Namen werden beim Speichern als
// Stamm-Übung angelegt. Sätze loggst du danach via „Neue Session".
export function NewTrainingUnitDialog({ exerciseNames }: Props) {
  const router = useRouter();
  const datalistId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE_KEYS[0]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow()]);

  const reset = () => {
    setName("");
    setColor(PALETTE_KEYS[0]);
    setColorPickerOpen(false);
    setRows([blankRow(), blankRow()]);
    setError(null);
  };

  // Marker-Buchstabe-Vorschau im Farb-Kreis (erstes Alphanumerische, groß).
  const letterPreview = (name.trim().match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) =>
    setRows((prev) => prev.filter((r) => r.key !== key));
  const move = (key: number, dir: -1 | 1) =>
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleCreate = () => {
    setError(null);
    const exercises = rows
      .map((r) => ({
        name: r.name.trim(),
        repMin: r.repMin,
        repMax: r.repMax,
        unilateral: r.unilateral,
        defaultSets: r.defaultSets,
      }))
      .filter((r) => r.name.length > 0);
    if (!name.trim()) {
      setError("Bitte einen Namen für die Einheit eingeben.");
      return;
    }
    if (exercises.length === 0) {
      setError("Bitte mindestens eine Übung hinzufügen.");
      return;
    }
    startTransition(async () => {
      const result = await createTrainingUnit({
        name: name.trim(),
        color,
        exercises,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.push(`/hypertrophy/${result.slug}`);
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="size-3.5" />
        Neue Trainingseinheit
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="max-w-2xl">
            <Dialog.CloseIconButton />
            <Dialog.Header
              title="Neue Trainingseinheit"
              description="Name, Farbe und Übungen festlegen. Übungen aus dem Katalog wählen oder neue benennen — Sätze loggst du danach als normale Session."
            />

            <div className="space-y-5">
              <div className="flex items-center gap-3">
                {/* Einzelner Farb-Kreis — Palette erscheint erst beim Klick. */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label="Farbe wählen"
                    onClick={() => setColorPickerOpen((o) => !o)}
                    className={cn(
                      "inline-flex size-12 items-center justify-center rounded-full font-heading text-lg font-semibold text-white ring-2 ring-foreground/10 transition-transform hover:scale-105",
                      TEMPLATE_PALETTE[color].bg,
                    )}
                  >
                    {letterPreview}
                  </button>
                  {colorPickerOpen && (
                    <>
                      {/* Klick außerhalb schließt das Popover. */}
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        onClick={() => setColorPickerOpen(false)}
                        className="fixed inset-0 z-10 cursor-default"
                      />
                      <div className="absolute top-full left-0 z-20 mt-2 w-max rounded-xl border border-border bg-popover p-2 shadow-lg">
                        <div className="grid grid-cols-6 gap-1.5">
                          {PALETTE_KEYS.map((key) => (
                            <button
                              key={key}
                              type="button"
                              aria-label={`Farbe ${key}`}
                              onClick={() => {
                                setColor(key);
                                setColorPickerOpen(false);
                              }}
                              className={cn(
                                "size-7 rounded-full ring-2 transition-transform hover:scale-110",
                                TEMPLATE_PALETTE[key].bg,
                                color === key
                                  ? "ring-foreground/50"
                                  : "ring-transparent",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Großes Namensfeld. */}
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name der Einheit, z. B. Push"
                  autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 font-heading text-xl font-semibold tracking-tight outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Übungen
                </p>
                <div className="space-y-2">
                  {rows.map((row, idx) => (
                    <div
                      key={row.key}
                      className="rounded-xl bg-card p-3 ring-1 ring-foreground/10"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            aria-label="Nach oben"
                            disabled={idx === 0}
                            onClick={() => move(row.key, -1)}
                            className="text-muted-foreground/50 hover:text-foreground disabled:opacity-30"
                          >
                            <GripVertical className="size-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          list={datalistId}
                          value={row.name}
                          onChange={(e) =>
                            updateRow(row.key, { name: e.target.value })
                          }
                          placeholder="Übung wählen oder neu benennen"
                          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring/40"
                        />
                        <button
                          type="button"
                          aria-label="Übung entfernen"
                          onClick={() => removeRow(row.key)}
                          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-6 text-xs text-muted-foreground">
                        <label className="flex items-center gap-1.5">
                          Sätze
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={row.defaultSets ?? 3}
                            onChange={(e) =>
                              updateRow(row.key, {
                                defaultSets: Number(e.target.value),
                              })
                            }
                            className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                          />
                        </label>
                        <label className="flex items-center gap-1.5">
                          Reps
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={row.repMin}
                            onChange={(e) =>
                              updateRow(row.key, {
                                repMin: Number(e.target.value),
                              })
                            }
                            className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                          />
                          –
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={row.repMax}
                            onChange={(e) =>
                              updateRow(row.key, {
                                repMax: Number(e.target.value),
                              })
                            }
                            className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 select-none">
                          <input
                            type="checkbox"
                            checked={row.unilateral ?? false}
                            onChange={(e) =>
                              updateRow(row.key, { unilateral: e.target.checked })
                            }
                            className="size-3.5 accent-foreground"
                          />
                          einarmig (nur für neue Übungen)
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows((prev) => [...prev, blankRow()])}
                >
                  <Plus className="size-3.5" />
                  Übung
                </Button>
                <datalist id={datalistId}>
                  {exerciseNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={pending}>
                Einheit anlegen
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

