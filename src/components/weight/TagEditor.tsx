"use client";

import { Cookie, Plus, RotateCcw, Trash2, Wine } from "lucide-react";
import { useState, useTransition } from "react";

import { removeDailyTag, saveDailyTag } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { DailyTag } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  tags: DailyTag[];
};

// Übersicht aller getaggten Tage + Dialog zum Anlegen/Editieren eines Tags.
// Tag-Editing geht zusätzlich auch über den Day-Detail-Dialog im
// Gewichtsverlauf-Chart (gleiche Server-Actions).
export function TagEditor({ tags }: Props) {
  const [editing, setEditing] = useState<DailyTag | null>(null);
  const [creating, setCreating] = useState(false);

  const cheatDays = tags.filter((t) => t.cheatDay).length;
  const alcoholDays = tags.filter((t) => t.alcohol).length;
  const cheatMeals = tags.filter((t) => t.cheatMeal).length;

  // Chronologisch absteigend — neueste zuerst.
  const sorted = [...tags].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-3 gap-4">
          <SummaryStat icon={<Cookie className="size-4" />} label="Cheat-Days" count={cheatDays} />
          <SummaryStat icon={<Wine className="size-4" />} label="Alkohol-Tage" count={alcoholDays} />
          <SummaryStat icon={<RotateCcw className="size-4" />} label="Cheat-Meals" count={cheatMeals} />
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          <Plus className="size-3.5" />
          Tag hinzufügen
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
          Noch keine Tags. Klick „Tag hinzufügen", um einen Tag zu markieren.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl ring-1 ring-black/5">
          {sorted.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-4 bg-card px-4 py-3 transition hover:bg-muted/30"
            >
              <div className="flex flex-1 items-center gap-3">
                <p className="w-32 text-sm font-medium tabular-nums">
                  {formatLong(tag.date)}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tag.cheatDay && (
                    <Pill icon={<Cookie className="size-3" />} label="Cheat Day" />
                  )}
                  {tag.cheatMeal && (
                    <Pill icon={<RotateCcw className="size-3" />} label="Cheat Meal" />
                  )}
                  {tag.alcohol && (
                    <Pill icon={<Wine className="size-3" />} label="Alkohol" />
                  )}
                  {tag.kcalTarget != null && (
                    <Pill label={`Ziel ${tag.kcalTarget} kcal`} />
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setEditing(tag);
                }}
              >
                Bearbeiten
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TagDialog
        open={editing !== null || creating}
        tag={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-rose-600">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
        {count}
      </p>
    </div>
  );
}

function Pill({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
      {icon && <span className="text-rose-600">{icon}</span>}
      {label}
    </span>
  );
}

// ============================================================
// Dialog zum Anlegen/Editieren eines Tags.
// Bei „Anlegen": Date-Picker + Toggles. Beim Editieren: Date readonly.
// ============================================================
function TagDialog({
  open,
  tag,
  onClose,
}: {
  open: boolean;
  tag: DailyTag | null;
  onClose: () => void;
}) {
  const isEditing = tag !== null;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(() => tag?.date ?? today());
  const [cheatDay, setCheatDay] = useState(tag?.cheatDay ?? false);
  const [alcohol, setAlcohol] = useState(tag?.alcohol ?? false);
  const [cheatMeal, setCheatMeal] = useState(tag?.cheatMeal ?? false);
  const [kcalTargetInput, setKcalTargetInput] = useState(
    tag?.kcalTarget != null ? String(tag.kcalTarget) : "",
  );

  // Wenn sich der Tag ändert (Wechsel von Anlegen zu Editieren) Form-State reset.
  if (open && tag?.date && tag.date !== date) {
    setDate(tag.date);
    setCheatDay(tag.cheatDay);
    setAlcohol(tag.alcohol);
    setCheatMeal(tag.cheatMeal);
    setKcalTargetInput(tag.kcalTarget != null ? String(tag.kcalTarget) : "");
    setError(null);
  }

  const handleSave = () => {
    setError(null);
    const kcalRaw = kcalTargetInput.trim();
    let kcalTarget: number | null = null;
    if (kcalRaw.length > 0) {
      const n = Number(kcalRaw);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        setError("Kalorienziel muss 0–10.000 sein.");
        return;
      }
      kcalTarget = Math.round(n);
    }

    startTransition(async () => {
      const result = await saveDailyTag({
        date,
        cheatDay,
        alcohol,
        cheatMeal,
        kcalTarget,
      });
      if (!result.ok) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onClose();
    });
  };

  const handleDelete = () => {
    if (!isEditing) return;
    if (!confirm(`Alle Tags vom ${formatLong(date)} löschen?`)) return;
    startTransition(async () => {
      await removeDailyTag(date);
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
            title={isEditing ? formatLong(date) : "Tag hinzufügen"}
            description="Markierungen für einen Tag — unabhängig vom Gewichts-Eintrag."
          />

          <div className="space-y-5">
            <Field label="Datum">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isEditing}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
              />
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
                  label="Cheat Meal"
                  icon={<RotateCcw className="size-3.5" />}
                  checked={cheatMeal}
                  onChange={setCheatMeal}
                />
                <Toggle
                  label="Alkohol"
                  icon={<Wine className="size-3.5" />}
                  checked={alcohol}
                  onChange={setAlcohol}
                />
              </div>
            </Field>

            <Field label="Kalorienziel (kcal, optional)">
              <input
                type="text"
                inputMode="numeric"
                value={kcalTargetInput}
                onChange={(e) => setKcalTargetInput(e.target.value)}
                placeholder="z. B. 2300"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
              />
            </Field>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            {isEditing ? (
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

// ---- helpers ----

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
  const weekday = d.toLocaleDateString("de-DE", { weekday: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("de-DE", { month: "short" });
  const year = d.getFullYear();
  return `${weekday}, ${day}. ${month} ${year}`;
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
