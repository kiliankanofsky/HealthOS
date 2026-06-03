"use client";

import { UploadCloud, X } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createPlanFromSettings,
  type CreatePlanState,
} from "@/app/endurance/recommendations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  derivePaceZones,
  formatPace,
  parseHmsToSeconds,
} from "@/lib/endurance/plan";

const DEFAULT_TOTAL_WEEKS = 16;
const DEFAULT_DISTANCE = 42.195;
// Referenzdatei: PDF oder Bild (wird nativ an Claude/Vision übergeben).
const REFERENCE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
function isAllowedReference(file: File): boolean {
  return REFERENCE_TYPES.includes(file.type);
}
const ZONE_LABELS = [
  "Z1 Recovery",
  "Z2 Endurance",
  "Z3 Marathon",
  "Z4 Threshold",
  "Z5 VO2 Max",
] as const;

export function PlanSetupForm() {
  const [state, action] = useActionState<CreatePlanState | undefined, FormData>(
    createPlanFromSettings,
    undefined,
  );

  // Live-Berechnung des Ziel-Pace und der abgeleiteten Zonen.
  const [targetTime, setTargetTime] = useState("3:00:00");
  const [raceDistance, setRaceDistance] = useState(String(DEFAULT_DISTANCE));
  const [manualZones, setManualZones] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const targetPaceSec = useMemo(() => {
    try {
      const secs = parseHmsToSeconds(targetTime);
      const distance = Number(raceDistance.replace(",", "."));
      if (!Number.isFinite(distance) || distance <= 0) return null;
      return secs / distance;
    } catch {
      return null;
    }
  }, [targetTime, raceDistance]);

  const zones = useMemo(
    () => (targetPaceSec ? derivePaceZones(targetPaceSec) : null),
    [targetPaceSec],
  );

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isAllowedReference(file)) {
      setPdfFile(file);
    }
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && isAllowedReference(file)) {
      setPdfFile(file);
    }
  }

  return (
    <form action={action} className="space-y-8">
      {/* Hidden file input — drag-and-drop oder click triggert es. */}
      <input
        id="pdf-input"
        name="reference"
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={onFileSelect}
      />

      {/* ─── Section: Plan-Grundlagen ─── */}
      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-medium">
          Plan-Grundlagen
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Plan-Name</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="BMW Berlin Marathon 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="raceName">Race-Name (optional)</Label>
            <Input
              id="raceName"
              name="raceName"
              placeholder="BMW Berlin Marathon"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="raceDate">Race-Datum</Label>
            <Input id="raceDate" name="raceDate" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="raceDistanceKm">Race-Distanz (km)</Label>
            <Input
              id="raceDistanceKm"
              name="raceDistanceKm"
              type="number"
              step="0.001"
              min="0"
              value={raceDistance}
              onChange={(e) => setRaceDistance(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetTime">Zielzeit (h:mm:ss)</Label>
            <Input
              id="targetTime"
              name="targetTime"
              placeholder="3:00:00"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              required
            />
            {targetPaceSec !== null && (
              <p className="text-xs text-muted-foreground">
                Ergibt Ziel-Pace{" "}
                <span className="font-medium text-foreground">
                  {formatPace(targetPaceSec, { withUnit: true })}
                </span>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="totalWeeks">Anzahl Wochen</Label>
            <Input
              id="totalWeeks"
              name="totalWeeks"
              type="number"
              min="1"
              max="52"
              defaultValue={DEFAULT_TOTAL_WEEKS}
              required
            />
          </div>
        </div>
      </fieldset>

      {/* ─── Section: Volumen ─── */}
      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-medium">Volumen</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="targetWeeklyKmPeak">km/Woche im Peak</Label>
            <Input
              id="targetWeeklyKmPeak"
              name="targetWeeklyKmPeak"
              type="number"
              step="1"
              min="0"
              placeholder="z. B. 80"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sessionsPerWeek">Sessions/Woche</Label>
            <Input
              id="sessionsPerWeek"
              name="sessionsPerWeek"
              type="number"
              min="1"
              max="14"
              placeholder="z. B. 6"
            />
          </div>
        </div>
      </fieldset>

      {/* ─── Section: Pace-Zonen ─── */}
      <fieldset className="space-y-4">
        <div className="flex items-center justify-between">
          <legend className="font-heading text-lg font-medium">
            Pace-Zonen
          </legend>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={manualZones}
              onChange={(e) => setManualZones(e.target.checked)}
            />
            Manuell überschreiben
          </label>
        </div>
        {!manualZones && zones && (
          <p className="text-sm text-muted-foreground">
            Auto-abgeleitet aus deinem Ziel-Pace. Bei aktivierter Manuell-Option
            kannst du jede Zone individuell setzen.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {(["z1", "z2", "z3", "z4", "z5"] as const).map((zKey, idx) => {
            const z = zones?.[zKey];
            return (
              <div key={zKey} className="space-y-2 rounded-xl bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">{ZONE_LABELS[idx]}</p>
                {manualZones ? (
                  <>
                    <Input
                      type="number"
                      name={`${zKey}Min`}
                      placeholder="min (s/km)"
                      step="1"
                      min="0"
                      defaultValue={z?.minSec ? Math.round(z.minSec) : ""}
                    />
                    <Input
                      type="number"
                      name={`${zKey}Max`}
                      placeholder="max (s/km)"
                      step="1"
                      min="0"
                      defaultValue={z?.maxSec ? Math.round(z.maxSec) : ""}
                    />
                  </>
                ) : (
                  <p className="text-sm text-foreground">
                    {z
                      ? `${formatPace(z.minSec)} – ${formatPace(z.maxSec, { withUnit: true })}`
                      : "—"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* ─── Section: Referenz-Plan (PDF/Bild) ─── */}
      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-medium">
          Referenz-Trainingsplan (PDF oder Bild)
        </legend>
        <p className="text-sm text-muted-foreground">
          Optional. Die Datei wird nativ an die KI übergeben (Vision) und
          möglichst originalgetreu in den Plan übernommen. PDF oder Screenshot.
        </p>
        <label
          htmlFor="pdf-input"
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 transition ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-foreground/15 hover:border-foreground/30"
          }`}
        >
          {pdfFile ? (
            <>
              <p className="text-sm font-medium">{pdfFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(pdfFile.size / 1024).toFixed(0)} KB · klicken oder ziehen zum
                Ersetzen
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setPdfFile(null);
                  const input = document.getElementById(
                    "pdf-input",
                  ) as HTMLInputElement | null;
                  if (input) input.value = "";
                }}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
                Entfernen
              </button>
            </>
          ) : (
            <>
              <UploadCloud className="size-8 text-muted-foreground" />
              <p className="text-sm">Datei hierher ziehen oder klicken</p>
              <p className="text-xs text-muted-foreground">PDF, PNG, JPG oder WEBP</p>
            </>
          )}
        </label>
      </fieldset>

      {/* ─── Submit ─── */}
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state && !state.ok && state.error && (
          <span className="text-sm text-red-600">{state.error}</span>
        )}
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lege Plan an…" : "Plan anlegen"}
    </Button>
  );
}
