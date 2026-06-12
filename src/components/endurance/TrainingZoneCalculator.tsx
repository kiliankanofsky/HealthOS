"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPace } from "@/lib/endurance/plan";
import { cn } from "@/lib/utils";

// ============================================================
// Training Zone Calculator — Pace- und HF-Zonen aus der Schwelle.
//
// Pace-Zonen: Faktoren auf die Schwellen-Pace (sec/km, Friel-angelehnt) —
// langsamer = größerer Faktor. HF-Zonen: %-Bereiche der Laktatschwellen-HF
// (LTHR). Beides wird live aus den Eingaben berechnet; die Defaults kommen
// aus den letzten Garmin-Werten (Lactate Threshold), sind aber überschreibbar.
// Fehlt die LTHR, wird sie optional aus der Max-HF geschätzt (~90 %).
// ============================================================

type ZoneDef = {
  zone: string;
  name: string;
  description: string;
  // Pace-Faktoren auf die Schwellen-Pace (min = schneller, max = langsamer).
  paceFactorFast: number | null; // null = offen ("schneller als …" / "langsamer als …")
  paceFactorSlow: number | null;
  // %-LTHR-Bereich.
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

type Props = {
  /** Vorbefüllung aus Garmin (jüngster Wert ≠ null in der Historie). */
  defaultThresholdPaceSecPerKm: number | null;
  defaultLthr: number | null;
};

export function TrainingZoneCalculator({
  defaultThresholdPaceSecPerKm,
  defaultLthr,
}: Props) {
  const [paceInput, setPaceInput] = useState(
    defaultThresholdPaceSecPerKm != null
      ? formatPace(defaultThresholdPaceSecPerKm)
      : "",
  );
  const [lthrInput, setLthrInput] = useState(
    defaultLthr != null ? String(defaultLthr) : "",
  );
  const [maxHrInput, setMaxHrInput] = useState("");

  const thresholdPace = useMemo(() => parsePace(paceInput), [paceInput]);
  const lthr = useMemo(() => {
    const direct = parseIntInRange(lthrInput, 100, 220);
    if (direct != null) return direct;
    // Fallback: LTHR ≈ 90 % der Max-HF.
    const maxHr = parseIntInRange(maxHrInput, 120, 230);
    return maxHr != null ? Math.round(maxHr * 0.9) : null;
  }, [lthrInput, maxHrInput]);
  const lthrEstimated =
    parseIntInRange(lthrInput, 100, 220) == null && lthr != null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div className="space-y-1.5">
          <Label htmlFor="zone-maxhr">Max-HF (optional)</Label>
          <Input
            id="zone-maxhr"
            inputMode="numeric"
            placeholder="z.B. 192"
            value={maxHrInput}
            onChange={(e) => setMaxHrInput(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Nur als LTHR-Fallback (~90 % Max-HF)
            {lthrEstimated && " — wird gerade genutzt"}
          </p>
        </div>
      </div>

      {thresholdPace == null && lthr == null ? (
        <p className="rounded-2xl bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
          Gib eine Schwellen-Pace (m:ss) und/oder deine Schwellen-HF ein — die
          fünf Trainingszonen werden live berechnet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2.5 text-left sm:px-4">Zone</th>
                <th className="px-3 py-2.5 text-right sm:px-4">Pace</th>
                <th className="px-3 py-2.5 text-right sm:px-4">Herzfrequenz</th>
                <th className="hidden px-3 py-2.5 text-left sm:table-cell sm:px-4">
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
                    {paceRange(z, thresholdPace)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {hrRange(z, lthr)}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell sm:px-4">
                    {z.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Pace-Zonen als Faktor auf die Schwellen-Pace, HF-Zonen als Prozent der
        Laktatschwellen-HF (Friel-angelehnt). Schwellenwerte kommen aus deinem
        Garmin Lactate Threshold und lassen sich hier überschreiben — z.B. nach
        einem frischen Wettkampf oder Feldtest (30-min-All-out: Ø-HF der
        letzten 20 min ≈ LTHR).
      </p>
    </div>
  );
}

const ZONE_DOTS = [
  "bg-sky-400",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-600",
  "bg-rose-600",
];

function paceRange(z: ZoneDef, thresholdPace: number | null): string {
  if (thresholdPace == null) return "—";
  const fast =
    z.paceFactorFast != null
      ? formatPace(Math.round(thresholdPace * z.paceFactorFast))
      : null;
  const slow =
    z.paceFactorSlow != null
      ? formatPace(Math.round(thresholdPace * z.paceFactorSlow))
      : null;
  if (fast && slow) return `${fast}–${slow}/km`;
  if (fast) return `> ${fast}/km`;
  return "—";
}

function hrRange(z: ZoneDef, lthr: number | null): string {
  if (lthr == null) return "—";
  const low = z.hrPctLow != null ? Math.round((lthr * z.hrPctLow) / 100) : null;
  const high =
    z.hrPctHigh != null ? Math.round((lthr * z.hrPctHigh) / 100) : null;
  if (low != null && high != null) return `${low}–${high} bpm`;
  if (high != null) return `< ${high} bpm`;
  if (low != null) return `> ${low} bpm`;
  return "—";
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
