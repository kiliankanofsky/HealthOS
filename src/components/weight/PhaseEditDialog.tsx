"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { removePhase, savePhase } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { type PhaseKind, phaseKinds, type WeightPhase } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  phase: WeightPhase | null; // null = neu anlegen
  onClose: () => void;
};

const KIND_LABELS: Record<PhaseKind, string> = {
  bulk: "Aufbau",
  cut: "Defizit",
  maintenance: "Erhaltung",
};

const KIND_COLORS: Record<PhaseKind, string> = {
  bulk: "bg-violet-500/15 text-violet-700 ring-violet-500/30",
  cut: "bg-teal-500/15 text-teal-700 ring-teal-500/30",
  maintenance: "bg-amber-500/15 text-amber-700 ring-amber-500/30",
};

export function PhaseEditDialog({ open, phase, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<PhaseKind>("cut");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setKind(phase?.kind ?? "cut");
    setStartDate(phase?.startDate ?? "");
    setEndDate(phase?.endDate ?? "");
    setLabel(phase?.label ?? "");
  }, [open, phase]);

  const handleSave = () => {
    setError(null);
    if (!startDate) {
      setError("Bitte ein Startdatum wählen.");
      return;
    }
    startTransition(async () => {
      const result = await savePhase({
        id: phase?.id,
        kind,
        startDate,
        endDate: endDate || null,
        label: label || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onClose();
    });
  };

  const handleDelete = () => {
    if (!phase) return;
    if (!confirm(`Phase ab ${phase.startDate} löschen?`)) return;
    startTransition(async () => {
      await removePhase(phase.id);
      onClose();
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.CloseIconButton />
          <Dialog.Header
            title={phase ? "Phase bearbeiten" : "Phase hinzufügen"}
            description="Aufbau-, Defizit- oder Erhaltungsphase festlegen."
          />

          <div className="space-y-5">
            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Phasen-Art
              </p>
              <div className="flex gap-2">
                {phaseKinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors",
                      kind === k
                        ? KIND_COLORS[k]
                        : "bg-background text-muted-foreground ring-border hover:bg-muted/50",
                    )}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

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

            <div className="space-y-1.5">
              <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Label (optional)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Sommer-Cut"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            {phase ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
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
              <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={handleSave} disabled={pending}>
                Speichern
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
