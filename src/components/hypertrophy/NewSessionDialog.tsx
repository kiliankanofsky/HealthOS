"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSession } from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { paletteClasses } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";

export type SessionUnit = {
  slug: string;
  name: string;
  color: string | null;
  letter: string;
};

export function NewSessionDialog({ units }: { units: SessionUnit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(units[0]?.slug ?? "");
  const [date, setDate] = useState(() => toISODate(new Date()));

  const handleCreate = () => {
    setError(null);
    if (!slug) {
      setError("Bitte eine Einheit wählen.");
      return;
    }
    startTransition(async () => {
      const result = await createSession({ templateSlug: slug, date });
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
              description="Wähle Einheit und Datum. Eine vorhandene Session am gleichen Tag wird stattdessen geöffnet."
            />

            <div className="space-y-5">
              <Field label="Einheit">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {units.map((u) => {
                    const colors = paletteClasses(u.color);
                    const isActive = slug === u.slug;
                    return (
                      <button
                        key={u.slug}
                        type="button"
                        onClick={() => setSlug(u.slug)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg p-3 text-sm transition-colors",
                          isActive
                            ? "bg-foreground/5 ring-2 ring-foreground/20"
                            : "bg-muted/50 ring-1 ring-transparent hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex size-8 items-center justify-center rounded-full font-heading text-sm font-semibold text-white",
                            colors.bg,
                          )}
                        >
                          {u.letter}
                        </span>
                        <span className="text-center font-medium">{u.name}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Datum">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                />
              </Field>

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
                Öffnen
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
