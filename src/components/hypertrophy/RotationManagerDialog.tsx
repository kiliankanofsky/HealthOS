"use client";

import { ChevronDown, ChevronUp, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteTrainingUnit,
  reorderRotation,
  setUnitInRotation,
  updateTrainingUnit,
} from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PALETTE_KEYS, TEMPLATE_PALETTE } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";

export type ManagerUnit = {
  id: number;
  name: string;
  slug: string;
  color: string | null;
  letter: string;
  inRotation: boolean;
  sessionCount: number;
};

// Rotation verwalten: Einheiten in die Rotation aufnehmen/entfernen, sortieren,
// umbenennen, umfärben, löschen (mit Sessions → archivieren). Mutationen laufen
// sofort gegen Server-Actions; router.refresh() synchronisiert die Cards.
export function RotationManagerDialog({ units }: { units: ManagerUnit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ManagerUnit[]>(units);
  const [colorFor, setColorFor] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Beim Öffnen den aktuellen Stand übernehmen (Props können sich nach
  // router.refresh() geändert haben).
  const handleOpenChange = (next: boolean) => {
    if (next) setList(units);
    setColorFor(null);
    setError(null);
    setOpen(next);
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Aktion fehlgeschlagen.");
      router.refresh();
    });
  };

  const toggleRotation = (u: ManagerUnit) => {
    setList((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, inRotation: !x.inRotation } : x)),
    );
    run(() =>
      setUnitInRotation({ templateId: u.id, inRotation: !u.inRotation }),
    );
  };

  const move = (id: number, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    run(() => reorderRotation({ orderedTemplateIds: next.map((x) => x.id) }));
  };

  const rename = (u: ManagerUnit, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === u.name) return;
    setList((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, name: trimmed } : x)),
    );
    run(() => updateTrainingUnit({ templateId: u.id, name: trimmed }));
  };

  const recolor = (u: ManagerUnit, color: string) => {
    setColorFor(null);
    setList((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, color } : x)),
    );
    run(() => updateTrainingUnit({ templateId: u.id, color }));
  };

  const remove = (u: ManagerUnit) => {
    const msg =
      u.sessionCount > 0
        ? `„${u.name}" hat ${u.sessionCount} Session(s). Die Einheit wird archiviert (Historie bleibt erhalten). Fortfahren?`
        : `„${u.name}" löschen?`;
    if (!confirm(msg)) return;
    setList((prev) => prev.filter((x) => x.id !== u.id));
    run(() => deleteTrainingUnit({ templateId: u.id }));
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => handleOpenChange(true)}>
        <SlidersHorizontal className="size-3.5" />
        Rotation verwalten
      </Button>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="max-w-xl">
            <Dialog.CloseIconButton />
            <Dialog.Header
              title="Rotation verwalten"
              description="Reihenfolge, Sichtbarkeit, Name und Farbe deiner Einheiten. Aktive Einheiten erscheinen als Cards."
            />

            <div className="space-y-2">
              {list.length === 0 && (
                <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                  Noch keine Einheiten.
                </p>
              )}
              {list.map((u, idx) => (
                <div
                  key={u.id}
                  className="rounded-xl bg-card p-3 ring-1 ring-foreground/10"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="Nach oben"
                        disabled={idx === 0 || pending}
                        onClick={() => move(u.id, -1)}
                        className="text-muted-foreground/50 hover:text-foreground disabled:opacity-25"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Nach unten"
                        disabled={idx === list.length - 1 || pending}
                        onClick={() => move(u.id, 1)}
                        className="text-muted-foreground/50 hover:text-foreground disabled:opacity-25"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      aria-label="Farbe ändern"
                      onClick={() =>
                        setColorFor((c) => (c === u.id ? null : u.id))
                      }
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-semibold text-white ring-2 ring-transparent transition-transform hover:scale-105",
                        (u.color && TEMPLATE_PALETTE[u.color]?.bg) || "bg-slate-500",
                      )}
                    >
                      {u.letter}
                    </button>

                    <input
                      type="text"
                      defaultValue={u.name}
                      onBlur={(e) => rename(u, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-border focus:border-border focus:ring-2 focus:ring-ring/40"
                    />

                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
                      <input
                        type="checkbox"
                        checked={u.inRotation}
                        disabled={pending}
                        onChange={() => toggleRotation(u)}
                        className="size-3.5 accent-foreground"
                      />
                      Rotation
                    </label>

                    <button
                      type="button"
                      aria-label="Einheit löschen"
                      disabled={pending}
                      onClick={() => remove(u)}
                      className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {colorFor === u.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                      {PALETTE_KEYS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          aria-label={`Farbe ${key}`}
                          onClick={() => recolor(u, key)}
                          className={cn(
                            "size-6 rounded-full ring-2 transition-transform hover:scale-110",
                            TEMPLATE_PALETTE[key].bg,
                            u.color === key
                              ? "ring-foreground/50"
                              : "ring-transparent",
                          )}
                        />
                      ))}
                    </div>
                  )}

                  {u.sessionCount > 0 && (
                    <p className="mt-1 pl-8 text-[10px] text-muted-foreground">
                      {u.sessionCount} Session(s) · Löschen archiviert (Historie bleibt)
                    </p>
                  )}
                </div>
              ))}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>

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
