"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSession } from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// Wie NewSessionDialog, aber Workout ist vorgegeben — nur Datum-Auswahl.
export function OpenOrCreateSessionButton({
  templateSlug,
}: {
  templateSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => toISODate(new Date()));

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSession({ templateSlug, date });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/hypertrophy/${result.templateSlug}/${result.date}`);
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Neue Session
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseIconButton />
            <Dialog.Header
              title="Neue Session"
              description="Datum wählen. Vorhandene Session am gleichen Tag wird stattdessen geöffnet."
            />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Datum
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={pending}>
                Öffnen
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
