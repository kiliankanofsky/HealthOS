"use client";

import { Cookie, Trash2, Wine } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { removeWeightEntry, updateDayDetails } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { type WeightEntry, weightSources } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  date: string | null;
  entry: WeightEntry | null;
  onClose: () => void;
};

const SOURCE_LABELS: Record<(typeof weightSources)[number], string> = {
  manual: "Manuell",
  sheets: "Google Sheets",
  garmin: "Garmin",
};

export function WeightDayDetailDialog({ open, date, entry, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form-State, frisch initialisiert wenn Dialog für neuen Tag geöffnet wird.
  const [weightInput, setWeightInput] = useState("");
  const [source, setSource] = useState<(typeof weightSources)[number]>("manual");
  const [cheatDay, setCheatDay] = useState(false);
  const [alcohol, setAlcohol] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setWeightInput(entry ? entry.weightKg.toFixed(1).replace(".", ",") : "");
    setSource(entry?.source ?? "manual");
    setCheatDay(entry?.cheatDay ?? false);
    setAlcohol(entry?.alcohol ?? false);
    setNotes(entry?.notes ?? "");
  }, [open, entry]);

  if (!date) return null;

  const handleSave = () => {
    setError(null);
    const normalized = weightInput.replace(",", ".").trim();
    const weight = normalized.length > 0 ? Number(normalized) : null;
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 500)) {
      setError("Gewicht muss zwischen 0 und 500 kg liegen.");
      return;
    }
    if (weight === null && !entry) {
      setError("Bitte ein Gewicht eingeben.");
      return;
    }

    startTransition(async () => {
      const result = await updateDayDetails({
        date,
        weightKg: weight,
        source,
        cheatDay,
        alcohol,
        notes: notes.length > 0 ? notes : null,
      });
      if (!result.ok) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onClose();
    });
  };

  const handleDelete = () => {
    if (!entry) return;
    if (!confirm(`Eintrag vom ${formatLong(date)} löschen?`)) return;
    const fd = new FormData();
    fd.set("id", String(entry.id));
    startTransition(async () => {
      await removeWeightEntry(fd);
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
            title={formatLong(date)}
            description="Tagesdetails bearbeiten"
          />

          <div className="space-y-5">
            <Field label="Gewicht (kg)">
              <input
                type="text"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="z. B. 78,4"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
              />
            </Field>

            <Field label="Quelle">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as (typeof weightSources)[number])}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {weightSources.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Markierungen">
              <div className="flex flex-col gap-2">
                <Toggle
                  label="Cheat Day"
                  icon={<Cookie className="size-3.5" />}
                  checked={cheatDay}
                  onChange={setCheatDay}
                />
                <Toggle
                  label="Alkohol"
                  icon={<Wine className="size-3.5" />}
                  checked={alcohol}
                  onChange={setAlcohol}
                />
              </div>
            </Field>

            <Field label="Notizen">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </Field>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            {entry ? (
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

function Toggle({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        checked
          ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
          : "bg-muted/60 text-foreground/80 ring-1 ring-transparent hover:bg-muted",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full transition-colors",
            checked ? "bg-primary/15 text-rose-600" : "bg-muted-foreground/15 text-rose-600/80",
          )}
        >
          {icon}
        </span>
        <span>{label}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative inline-block h-5 w-9 flex-shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("de-DE", { month: "long" });
  const year = d.getFullYear();
  return `${weekday}, ${day}. ${month} ${year}`;
}
