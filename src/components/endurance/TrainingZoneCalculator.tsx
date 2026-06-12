"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatPace } from "@/lib/endurance/plan";
import {
  paceAtHr,
  type ZoneEstimation,
} from "@/lib/endurance/zone-estimation";
import { cn } from "@/lib/utils";

// ============================================================
// Training Zone Calculator — zwei Modi:
//
//   "Aus Lauf-Daten" (Default, wenn Datenlage reicht): Pace pro Zone kommt
//   aus der Pace↔HF-Regression über die Steady-Splits vergangener Läufe
//   (lib/endurance/zone-estimation.ts). Z5 wird über die Intervall-Work-
//   Splits gerechnet (schnellste kumulativ ≥5 min gehaltene Pace), weil die
//   HF dort nachhinkt. Einziger Anker: die LTHR (Garmin, überschreibbar).
//
//   "Formel" (Fallback/Vergleich): klassische Faktoren auf eine manuell
//   eingegebene Schwellen-Pace + %LTHR-Bereiche.
// ============================================================

type ZoneDef = {
  zone: string;
  name: string;
  description: string;
  // Formel-Modus: Faktoren auf die Schwellen-Pace (sec/km).
  paceFactorFast: number | null; // null = offen
  paceFactorSlow: number | null;
  // %-LTHR-Bereich (beide Modi).
  hrPctLow: number | null;
  hrPctHigh: number | null;
};

const ZONES: ZoneDef[] = [
  {
    zone: "Z1",
    name: "Recovery",
    description: "Regeneration, sehr locker",
    paceFactorFast: 1.21,
    paceFactorSlow: null,
    hrPctLow: null,
    hrPctHigh: 84,
  },
  {
    zone: "Z2",
    name: "Endurance",
    description: "Grundlagenausdauer, Long Runs",
    paceFactorFast: 1.12,
    paceFactorSlow: 1.21,
    hrPctLow: 85,
    hrPctHigh: 89,
  },
  {
    zone: "Z3",
    name: "Tempo",
    description: "Zügiger Dauerlauf, Marathon-Bereich",
    paceFactorFast: 1.05,
    paceFactorSlow: 1.12,
    hrPctLow: 90,
    hrPctHigh: 94,
  },
  {
    zone: "Z4",
    name: "Threshold",
    description: "Schwellentraining, Tempoläufe",
    paceFactorFast: 0.99,
    paceFactorSlow: 1.05,
    hrPctLow: 95,
    hrPctHigh: 99,
  },
  {
    zone: "Z5",
    name: "VO₂ Max",
    description: "Intervalle, 3–8 min Belastungen",
    paceFactorFast: 0.9,
    paceFactorSlow: 0.99,
    hrPctLow: 100,
    hrPctHigh: 105,
  },
];

const ZONE_DOTS = [
  "bg-sky-400",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-600",
  "bg-rose-600",
];

type Mode = "data" | "manual";

type ZoneRow = {
  pace: string;
  hr: string;
  /** Beobachtete Steady-Minuten in dieser HF-Zone (nur Daten-Modus). */
  evidenceMin: number | null;
};

type Props = {
  estimation: ZoneEstimation | null;
  /** Vorbefüllung aus Garmin (jüngster Wert ≠ null in der Historie). */
  defaultThresholdPaceSecPerKm: number | null;
  defaultLthr: number | null;
};

export function TrainingZoneCalculator({
  estimation,
  defaultThresholdPaceSecPerKm,
  defaultLthr,
}: Props) {
  const hasData = estimation?.regression != null;
  const [mode, setMode] = useState<Mode>(hasData ? "data" : "manual");
  const [paceInput, setPaceInput] = useState(
    defaultThresholdPaceSecPerKm != null
      ? formatPace(defaultThresholdPaceSecPerKm)
      : "",
  );
  const [lthrInput, setLthrInput] = useState(
    defaultLthr != null ? String(defaultLthr) : "",
  );

  const manualThresholdPace = useMemo(() => parsePace(paceInput), [paceInput]);
  const lthr = useMemo(
    () => parseIntInRange(lthrInput, 100, 220),
    [lthrInput],
  );

  // ---- Zeilen je Modus berechnen ----
  const rows: ZoneRow[] | null = useMemo(() => {
    if (mode === "data") {
      if (!hasData || lthr == null) return null;
      const reg = estimation!.regression!;
      const thresholdPace = paceAtHr(reg, lthr);
      return ZONES.map((z) => {
        const hrLo = z.hrPctLow != null ? Math.round((lthr * z.hrPctLow) / 100) : null;
        const hrHi = z.hrPctHigh != null ? Math.round((lthr * z.hrPctHigh) / 100) : null;
        let paceFast =
          hrHi != null ? paceAtHr(reg, hrHi) : null;
        let paceSlow = hrLo != null ? paceAtHr(reg, hrLo) : null;
        if (z.zone === "Z5") {
          // HF-Regression aus Steady-Daten extrapoliert oberhalb der Schwelle
          // schlecht — Z5 kommt aus den Intervall-Splits (Rechnung), Fallback
          // ~92 % der empirischen Schwellen-Pace.
          paceSlow = thresholdPace;
          paceFast =
            estimation!.vo2maxPaceSecPerKm ??
            (thresholdPace != null ? Math.round(thresholdPace * 0.92) : null);
        }
        // Evidenz: beobachtete Steady-Minuten in diesem HF-Bereich.
        const evidenceSec = estimation!.steadyLapPoints.reduce((acc, p) => {
          if (hrLo != null && p.hr < hrLo) return acc;
          if (hrHi != null && p.hr > hrHi) return acc;
          return acc + p.durationSec;
        }, 0);
        return {
          pace: paceRangeText(paceFast, paceSlow),
          hr: hrRangeText(hrLo, hrHi),
          evidenceMin: Math.round(evidenceSec / 60),
        };
      });
    }
    // Formel-Modus.
    if (manualThresholdPace == null && lthr == null) return null;
    return ZONES.map((z) => {
      const paceFast =
        manualThresholdPace != null && z.paceFactorFast != null
          ? Math.round(manualThresholdPace * z.paceFactorFast)
          : null;
      const paceSlow =
        manualThresholdPace != null && z.paceFactorSlow != null
          ? Math.round(manualThresholdPace * z.paceFactorSlow)
          : null;
      const hrLo =
        lthr != null && z.hrPctLow != null
          ? Math.round((lthr * z.hrPctLow) / 100)
          : null;
      const hrHi =
        lthr != null && z.hrPctHigh != null
          ? Math.round((lthr * z.hrPctHigh) / 100)
          : null;
      return {
        pace:
          manualThresholdPace == null ? "—" : paceRangeText(paceFast, paceSlow),
        hr: lthr == null ? "—" : hrRangeText(hrLo, hrHi),
        evidenceMin: null,
      };
    });
  }, [mode, hasData, estimation, lthr, manualThresholdPace]);

  const empiricalThreshold =
    hasData && lthr != null ? paceAtHr(estimation!.regression!, lthr) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          size="sm"
          options={[
            { value: "data", label: "Aus Lauf-Daten" },
            { value: "manual", label: "Formel" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === "data" && hasData && (
          <p className="text-[11px] text-muted-foreground">
            Fit-Qualität R² ={" "}
            {estimation!.regression!.r2.toFixed(2).replace(".", ",")}
            {estimation!.regression!.r2 < 0.5 && " — noch wackelig, mehr Steady-Läufe verbessern den Fit"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="zone-lthr">Schwellen-HF / LTHR (bpm)</Label>
          <Input
            id="zone-lthr"
            inputMode="numeric"
            placeholder="z.B. 172"
            value={lthrInput}
            onChange={(e) => setLthrInput(e.target.value)}
          />
          {defaultLthr != null && (
            <p className="text-[11px] text-muted-foreground">
              Garmin Lactate Threshold: {defaultLthr} bpm
            </p>
          )}
        </div>
        {mode === "manual" ? (
          <div className="space-y-1.5">
            <Label htmlFor="zone-pace">Schwellen-Pace (min/km)</Label>
            <Input
              id="zone-pace"
              inputMode="numeric"
              placeholder="z.B. 4:25"
              value={paceInput}
              onChange={(e) => setPaceInput(e.target.value)}
            />
            {defaultThresholdPaceSecPerKm != null && (
              <p className="text-[11px] text-muted-foreground">
                Garmin Lactate Threshold:{" "}
                {formatPace(defaultThresholdPaceSecPerKm, { withUnit: true })}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Empirische Anker
            </p>
            <p className="text-sm tabular-nums">
              Schwellen-Pace bei {lthr ?? "—"} bpm:{" "}
              <span className="font-medium">
                {empiricalThreshold != null
                  ? formatPace(empiricalThreshold, { withUnit: true })
                  : "—"}
              </span>
              {estimation?.vo2maxPaceSecPerKm != null && (
                <>
                  {" · "}VO₂max (Intervalle):{" "}
                  <span className="font-medium">
                    {formatPace(estimation.vo2maxPaceSecPerKm, { withUnit: true })}
                  </span>
                </>
              )}
              {estimation?.best20minPaceSecPerKm != null && (
                <>
                  {" · "}Best 20 min:{" "}
                  <span className="font-medium">
                    {formatPace(estimation.best20minPaceSecPerKm, { withUnit: true })}
                  </span>
                </>
              )}
            </p>
            {defaultThresholdPaceSecPerKm != null && (
              <p className="text-[11px] text-muted-foreground">
                Zum Vergleich — Garmin LT2:{" "}
                {formatPace(defaultThresholdPaceSecPerKm, { withUnit: true })}
              </p>
            )}
          </div>
        )}
      </div>

      {rows == null ? (
        <p className="rounded-2xl bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
          {mode === "data" && !hasData
            ? "Noch zu wenig verwertbare Lauf-Daten für die empirische Schätzung (es braucht ≥3 Steady-Läufe mit Splits und HF). Nutze solange den Formel-Modus."
            : mode === "data"
              ? "Gib deine Schwellen-HF (LTHR) ein — sie ist der Anker für die HF-Zonen, die Paces kommen aus deinen Läufen."
              : "Gib eine Schwellen-Pace (m:ss) und/oder deine Schwellen-HF ein — die fünf Trainingszonen werden live berechnet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2.5 text-left sm:px-4">Zone</th>
                <th className="px-3 py-2.5 text-right sm:px-4">Pace</th>
                <th className="px-3 py-2.5 text-right sm:px-4">Herzfrequenz</th>
                {mode === "data" && (
                  <th className="px-3 py-2.5 text-right sm:px-4">Beobachtet</th>
                )}
                <th className="hidden px-3 py-2.5 text-left lg:table-cell lg:px-4">
                  Einsatz
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {ZONES.map((z, idx) => (
                <tr key={z.zone}>
                  <td className="px-3 py-2.5 sm:px-4">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block size-2.5 shrink-0 rounded-full",
                          ZONE_DOTS[idx],
                        )}
                      />
                      <span className="font-medium">{z.zone}</span>
                      <span className="hidden text-muted-foreground min-[420px]:inline">
                        {z.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {rows[idx].pace}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {rows[idx].hr}
                  </td>
                  {mode === "data" && (
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground sm:px-4">
                      {rows[idx].evidenceMin != null && rows[idx].evidenceMin > 0
                        ? `${rows[idx].evidenceMin} min`
                        : "—"}
                    </td>
                  )}
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell lg:px-4">
                    {z.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "data" && estimation != null ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Datenbasis: {estimation.steadyRunCount} Steady-Läufe (
          {estimation.steadyLapCount} Splits) für die Pace↔HF-Regression,{" "}
          {estimation.intervalRunCount} strukturierte Einheiten (
          {estimation.workLapCount} Work-Splits) für den Z5-Anker — Zeitraum{" "}
          {formatShortDate(estimation.fromIso)}–{formatShortDate(estimation.toIso)}.
          Z1–Z4-Paces sind die in deinen Läufen tatsächlich beobachteten Paces
          bei der jeweiligen HF; Z5 ist aus den Intervall-Splits gerechnet
          (schnellste kumulativ ≥5 min gehaltene Pace). „Beobachtet" = wie viele
          Steady-Minuten in der Zone vorliegen — wenig Minuten heißt: Zone wenig
          abgesichert.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Formel-Modus: Pace-Zonen als Faktor auf die Schwellen-Pace, HF-Zonen
          als Prozent der LTHR (Friel-angelehnt) — als Vergleich oder solange
          die Datenbasis für die empirische Schätzung nicht reicht.
        </p>
      )}
    </div>
  );
}

function paceRangeText(
  paceFast: number | null,
  paceSlow: number | null,
): string {
  if (paceFast != null && paceSlow != null)
    return `${formatPace(paceFast)}–${formatPace(paceSlow)}/km`;
  if (paceFast != null) return `> ${formatPace(paceFast)}/km`;
  if (paceSlow != null) return `< ${formatPace(paceSlow)}/km`;
  return "—";
}

function hrRangeText(hrLo: number | null, hrHi: number | null): string {
  if (hrLo != null && hrHi != null) return `${hrLo}–${hrHi} bpm`;
  if (hrHi != null) return `< ${hrHi} bpm`;
  if (hrLo != null) return `> ${hrLo} bpm`;
  return "—";
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

// "4:25" / "4.25" → 265 s/km. Liefert null bei Unsinn (inkl. Out-of-Range).
function parsePace(input: string): number | null {
  const cleaned = input.trim().replace(",", ":").replace(".", ":");
  const m = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59) return null;
  // Plausibler Lauf-Bereich: 2:30–9:00 min/km.
  if (sec < 150 || sec > 540) return null;
  return sec;
}

function parseIntInRange(input: string, min: number, max: number): number | null {
  const n = Number(input.trim());
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}
