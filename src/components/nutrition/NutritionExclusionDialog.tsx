"use client";

import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  removeNutritionExclusion,
  saveNutritionExclusion,
} from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { NutritionExclusion } from "@/lib/db/schema";

type Props = {
  open: boolean;
  exclusions: NutritionExclusion[];
  onClose: () => void;
};

// Zeiträume, in denen fddb nur sporadisch benutzt wurde (Urlaub o.ä.).
// Bewusst ein reines Hand-Werkzeug: nichts leitet solche Zeiträume automatisch
// ab — von außen ist ein Tracking-Loch nicht von einem echten Fastentag zu
// unterscheiden.
//
// Zwei Ansichten in einem Dialog: Liste aller Zeiträume, und das Formular für
// einen davon (neu oder bearbeiten). Aufgebaut wie der PhaseEditDialog des
// Gewichts-Verlaufs.
export function NutritionExclusionDialog({ open, exclusions, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // null = Liste; sonst der gerade bearbeitete Zeitraum ("new" = neu anlegen).
  const [editing, setEditing] = useState<NutritionExclusion | "new" | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");

  // Beim Schließen zurücksetzen — der Dialog bleibt gemountet, soll aber beim
  // nächsten Öffnen wieder mit der Liste starten.
  const close = () => {
    setEditing(null);
    setError(null);
    onClose();
  };

  const openEditor = (target: NutritionExclusion | "new") => {
    setError(null);
    setEditing(target);
    setStartDate(target === "new" ? "" : target.startDate);
    setEndDate(target === "new" ? "" : target.endDate ?? "");
    setLabel(target === "new" ? "" : target.label ?? "");
  };

  const handleSave = () => {
    setError(null);
    if (!startDate) {
      setError("Bitte ein Startdatum wählen.");
      return;
    }
    startTransition(async () => {
      const result = await saveNutritionExclusion({
        id: editing !== "new" && editing !== null ? editing.id : undefined,
        startDate,
        endDate: endDate || null,
        label: label || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setEditing(null);
    });
  };

  const handleDelete = (target: NutritionExclusion) => {
    if (!confirm(`Zeitraum ab ${formatDate(target.startDate)} löschen?`)) return;
    startTransition(async () => {
      await removeNutritionExclusion(target.id);
      setEditing(null);
    });
  };

  const isEditing = editing !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.CloseIconButton />
          <Dialog.Header
            title={
              isEditing
                ? editing === "new"
                  ? "Zeitraum hinzufügen"
                  : "Zeitraum bearbeiten"
                : "Ausgeschlossene Zeiträume"
            }
            description="Tage mit sporadischem fddb-Tracking. Der Chart überbrückt sie gestrichelt, statt eine unvollständige Tagesbilanz als Messung zu zeigen."
          />

          {isEditing ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Start
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Ende (optional)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ohne Enddatum gilt der Ausschluss offen bis heute.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="z. B. Urlaub Italien"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {exclusions.length === 0 ? (
                <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  Noch keine Zeiträume ausgeschlossen.
                </p>
              ) : (
                <ul className="space-y-2">
                  {exclusions.map((ex) => (
                    <li key={ex.id}>
                      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted">
                        <button
                          type="button"
                          onClick={() => openEditor(ex)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <CalendarOff
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium tabular-nums">
                              {formatRange(ex.startDate, ex.endDate)}
                            </span>
                            {ex.label && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {ex.label}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ex)}
                          disabled={pending}
                          aria-label={`Zeitraum ab ${formatDate(ex.startDate)} löschen`}
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {isEditing ? (
              <>
                {editing !== "new" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(editing)}
                    disabled={pending}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Löschen
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(null)}
                    disabled={pending}
                  >
                    Zurück
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={pending}>
                    Speichern
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditor("new")}
                  disabled={pending}
                >
                  <Plus className="size-3.5" />
                  Zeitraum hinzufügen
                </Button>
                <Button size="sm" onClick={close} disabled={pending}>
                  Fertig
                </Button>
              </>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function formatRange(startIso: string, endIso: string | null): string {
  return endIso
    ? `${formatDate(startIso)} – ${formatDate(endIso)}`
    : `ab ${formatDate(startIso)}`;
}
