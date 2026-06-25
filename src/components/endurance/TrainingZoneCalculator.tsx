"use client";

import { Info } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPace } from "@/lib/endurance/plan";
import {
  buildZoneRows,
  type ZoneEstimation,
  type ZoneRow,
} from "@/lib/endurance/zone-estimation";
import { cn } from "@/lib/utils";

// ============================================================
// Training Zone Calculator — hybrides 5-Zonen-Modell, eine Übersicht.
//
// Zweck-Zonen im LT1/LT2-Gerüst: Z1 Recovery · Z2 Endurance (beide HF-gesteuert,
// unter LT1) · Z3 Marathon · Z4 Threshold · Z5 VO₂max (pace-gesteuert).
// Paces aus echten Daten abgeleitet (siehe zone-estimation.ts): Easy-Zonen
// beobachtet, Z3 aus Garmin-Marathon-Prognose (+ optionalem Ziel-MP-Feld),
// Z4 aus konsolidierter Schwellen-Pace, Z5 aus Intervall-Splits. Methodik +
// %-HFmax-Brücke + Quelle pro Zone liegen in den Popovern.
// ============================================================

const ZONE_DOTS: Record<string, string> = {
  Z1: "bg-sky-400",
  Z2: "bg-emerald-500",
  Z3: "bg-amber-500",
  Z4: "bg-orange-600",
  Z5: "bg-rose-600",
};

type Props = {
  estimation: ZoneEstimation | null;
  defaultLthr: number | null;
  /** Garmin-Marathon-Prognose ÷ 42,195 km (sec/km) — Default-Anker für Z3. */
  defaultMarathonPredPace: number | null;
};

export function TrainingZoneCalculator({
  estimation,
  defaultLthr,
  defaultMarathonPredPace,
}: Props) {
  const [lthrInput, setLthrInput] = useState(
    defaultLthr != null ? String(defaultLthr) : "",
  );
  // Optionales Ziel-Marathon-Pace-Feld (leer = datenabgeleitet aus Garmin-Prognose).
  const [goalMpInput, setGoalMpInput] = useState("");
  const lthr = useMemo(
    () => parseIntInRange(lthrInput, 100, 220),
    [lthrInput],
  );
  const goalMp = useMemo(() => parsePaceToSec(goalMpInput), [goalMpInput]);

  const rows: ZoneRow[] | null = useMemo(() => {
    if (estimation == null || lthr == null) return null;
    return buildZoneRows(estimation, lthr, { goalMpSecPerKm: goalMp });
  }, [estimation, lthr, goalMp]);

  const hrMaxEst = estimateHrMax(lthr);

  const hasAnyData =
    estimation != null &&
    (estimation.regression != null || estimation.thresholdPace != null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="zone-lthr">LTHR (bpm)</Label>
          <Input
            id="zone-lthr"
            inputMode="numeric"
            placeholder="z.B. 178"
            value={lthrInput}
            onChange={(e) => setLthrInput(e.target.value)}
          />
          {defaultLthr != null && (
            <p className="text-[11px] text-muted-foreground">
              Garmin: {defaultLthr} bpm — überschreibbar
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zone-goalmp">Ziel-Marathon-Pace</Label>
          <Input
            id="zone-goalmp"
            inputMode="text"
            placeholder="z.B. 4:15"
            value={goalMpInput}
            onChange={(e) => setGoalMpInput(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {goalMpInput.trim() === ""
              ? defaultMarathonPredPace != null
                ? `leer = Garmin-Prognose (${formatPace(defaultMarathonPredPace, { withUnit: true })})`
                : "leer = aus Daten abgeleitet"
              : goalMp != null
                ? `Z3 auf ${formatPace(goalMp, { withUnit: true })} gesetzt`
                : "Format mm:ss"}
          </p>
        </div>
        <MethodologyPopover estimation={estimation} hrMax={hrMaxEst} />
      </div>

      {rows == null ? (
        <p className="rounded-2xl bg-muted/40 px-5 py-6 text-center text-sm text-muted-foreground">
          {lthr == null
            ? "Gib deine Schwellen-HF (LTHR) ein — Garmin liefert sie sonst automatisch."
            : !hasAnyData
              ? "Noch zu wenig verwertbare Lauf-Daten. Es braucht ≥ 3 Steady-Läufe mit Splits und HF oder einen Garmin-LT2-Wert."
              : "—"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[36%]" />
              <col className="w-[34%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-2.5 text-left sm:px-4">Zone</th>
                <th className="px-2 py-2.5 text-right sm:px-4">Pace</th>
                <th className="px-2 py-2.5 text-right sm:px-4">HF</th>
                <th className="px-1 py-2.5 sm:px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((row) => (
                <ZoneTableRow
                  key={row.zone.zone}
                  row={row}
                  estimation={estimation!}
                  hrMax={hrMaxEst}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sichtbarer Aktualitäts-Hinweis: Zonen werden bei jedem Sync aus den
          jüngsten Läufen + Garmin-Werten neu abgeleitet. */}
      {rows != null && estimation != null && (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/80">
            Stand {formatShortDate(estimation.toIso)}
          </span>{" "}
          · automatisch bei jedem Sync neu abgeleitet aus{" "}
          {estimation.steadyRunCount} Steady-Läufen + {estimation.intervalRunCount}{" "}
          Intervall-Einheiten (Zeitraum {formatShortDate(estimation.fromIso)}–
          {formatShortDate(estimation.toIso)})
          {lthr != null ? `, LTHR ${lthr} bpm` : ""}.
        </p>
      )}
    </div>
  );
}

function ZoneTableRow({
  row,
  estimation,
  hrMax,
}: {
  row: ZoneRow;
  estimation: ZoneEstimation;
  hrMax: number | null;
}) {
  return (
    <tr>
      <td className="px-2 py-2.5 sm:px-4">
        <span className="flex items-center gap-1.5 sm:gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-block size-2.5 shrink-0 rounded-full",
              ZONE_DOTS[row.zone.zone],
            )}
          />
          <span className="font-medium">{row.zone.zone}</span>
          <span className="hidden text-muted-foreground sm:inline">
            {row.zone.name}
          </span>
        </span>
      </td>
      <td
        className={cn(
          "px-2 py-2.5 text-right text-xs tabular-nums whitespace-nowrap sm:px-4 sm:text-sm",
          row.zone.anchor === "pace"
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {paceRangeText(row.paceFast, row.paceSlow)}
      </td>
      <td
        className={cn(
          "px-2 py-2.5 text-right text-xs tabular-nums whitespace-nowrap sm:px-4 sm:text-sm",
          row.zone.anchor === "hr"
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {hrRangeText(row.hrLow, row.hrHigh)}
      </td>
      <td className="px-1 py-2.5 text-right sm:px-3">
        <Popover>
          <PopoverTrigger
            aria-label={`Details zu ${row.zone.zone}`}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Info className="size-4" />
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <ZoneDetailContent row={row} estimation={estimation} hrMax={hrMax} />
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  );
}

function ZoneDetailContent({
  row,
  estimation,
  hrMax,
}: {
  row: ZoneRow;
  estimation: ZoneEstimation;
  hrMax: number | null;
}) {
  const pctHrMax = pctHrMaxText(row.hrLow, row.hrHigh, hrMax);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "inline-block size-2.5 shrink-0 rounded-full",
            ZONE_DOTS[row.zone.zone],
          )}
        />
        <p className="font-medium">
          {row.zone.zone} · {row.zone.name}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{row.zone.description}</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Steuern nach</dt>
        <dd className="text-right font-medium">
          {row.zone.anchor === "pace" ? "Pace" : "Herzfrequenz"}
        </dd>
        <dt className="text-muted-foreground">% LTHR</dt>
        <dd className="text-right tabular-nums">{pctRangeText(row.zone.hrPctLow, row.zone.hrPctHigh)}</dd>
        {pctHrMax != null && (
          <>
            <dt className="text-muted-foreground">≈ % HFmax</dt>
            <dd className="text-right tabular-nums">{pctHrMax}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Pace-Quelle</dt>
        <dd className="text-right">{paceSourceLabel(row.paceSource)}</dd>
        <dt className="text-muted-foreground">Beobachtet</dt>
        <dd className="text-right tabular-nums">
          {row.evidenceMinutes > 0 ? `${row.evidenceMinutes} min` : "—"}
        </dd>
        {row.zone.zone === "Z3" && estimation.marathonPace != null && (
          <>
            <dt className="text-muted-foreground">Marathon-Anker</dt>
            <dd className="text-right tabular-nums">
              {estimation.marathonPace.garminPredPace != null
                ? `Garmin ${formatPace(estimation.marathonPace.garminPredPace, { withUnit: true })}`
                : "—"}
              {estimation.marathonPace.observedPace != null
                ? ` · beob. ${formatPace(estimation.marathonPace.observedPace)}`
                : ""}
            </dd>
          </>
        )}
        {row.zone.zone === "Z5" && estimation.vo2maxPaceSecPerKm != null && (
          <>
            <dt className="text-muted-foreground">VO₂max-Anker</dt>
            <dd className="text-right tabular-nums">
              {formatPace(estimation.vo2maxPaceSecPerKm, { withUnit: true })}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function MethodologyPopover({
  estimation,
  hrMax,
}: {
  estimation: ZoneEstimation | null;
  hrMax: number | null;
}) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1.5 self-start rounded-full bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:self-end">
        <Info className="size-3.5" />
        Methodik &amp; Datenbasis
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top" align="end">
        <div className="space-y-2 text-xs leading-relaxed">
          <p className="font-medium text-foreground">
            Hybrides 5-Zonen-Modell (LT1/LT2)
          </p>
          <p className="text-muted-foreground">
            Z1/Z2 unter LT1 nach <strong>HF</strong>, Z3–Z5 nach{" "}
            <strong>Pace</strong> (HF hinkt bei Tempo nach). LT2 = Garmin-LTHR.
            {hrMax != null && (
              <>
                {" "}≈ HFmax <span className="tabular-nums">{hrMax}</span> bpm
                (LTHR ÷ 0,88) als Brücke zum %-HFmax-Modell.
              </>
            )}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Pace aus Daten:</span>{" "}
            Z1/Z2 beobachtet (Easy-Splits, 25.–75.-Perzentil), Z3 aus
            Garmin-Marathon-Prognose (per Ziel-MP überschreibbar), Z4 aus
            konsolidierter Schwellen-Pace, Z5 aus Intervall-Work-Splits.
          </p>
          {estimation != null && (
            <>
              {estimation.regression && (
                <p className="text-muted-foreground">
                  Pace↔HF-Fit R² ={" "}
                  {estimation.regression.r2.toFixed(2).replace(".", ",")} (Stand &amp;
                  Datenumfang siehe Zeile unter der Tabelle).
                </p>
              )}
              {estimation.thresholdPace != null && (
                <>
                  <p className="pt-1 font-medium text-foreground">
                    Schwellen-Pace (konsolidiert):{" "}
                    {formatPace(estimation.thresholdPace.paceSecPerKm, {
                      withUnit: true,
                    })}
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {estimation.thresholdPace.regressionPace != null && (
                      <li>
                        Regression (Pace @ LTHR):{" "}
                        {formatPace(estimation.thresholdPace.regressionPace, {
                          withUnit: true,
                        })}
                      </li>
                    )}
                    {estimation.thresholdPace.garminPace != null && (
                      <li>
                        Garmin LT2:{" "}
                        {formatPace(estimation.thresholdPace.garminPace, {
                          withUnit: true,
                        })}
                      </li>
                    )}
                    {estimation.thresholdPace.best20Pace != null && (
                      <li>
                        Best-20-min:{" "}
                        {formatPace(estimation.thresholdPace.best20Pace, {
                          withUnit: true,
                        })}
                      </li>
                    )}
                  </ul>
                </>
              )}
              {estimation.marathonPace != null && (
                <p className="pt-1 font-medium text-foreground">
                  Marathon-Pace (Z3):{" "}
                  {formatPace(estimation.marathonPace.paceSecPerKm, {
                    withUnit: true,
                  })}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({estimation.marathonPace.sources
                      .map((s) => (s === "garmin-pred" ? "Garmin-Prognose" : "beobachtet"))
                      .join(" + ")})
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function paceRangeText(
  paceFast: number | null,
  paceSlow: number | null,
): string {
  if (paceFast != null && paceSlow != null)
    return `${formatPace(paceFast)}–${formatPace(paceSlow)}`;
  if (paceFast != null) return `> ${formatPace(paceFast)}`;
  if (paceSlow != null) return `< ${formatPace(paceSlow)}`;
  return "—";
}

function hrRangeText(hrLo: number | null, hrHi: number | null): string {
  if (hrLo != null && hrHi != null) return `${hrLo}–${hrHi}`;
  if (hrHi != null) return `< ${hrHi}`;
  if (hrLo != null) return `> ${hrLo}`;
  return "—";
}

function pctRangeText(lo: number | null, hi: number | null): string {
  if (lo != null && hi != null) return `${lo}–${hi} %`;
  if (hi != null) return `< ${hi} %`;
  if (lo != null) return `≥ ${lo} %`;
  return "—";
}

function paceSourceLabel(source: ZoneRow["paceSource"]): string {
  switch (source) {
    case "observed":
      return "Lauf-Daten (beobachtet)";
    case "regression":
      return "Lauf-Regression";
    case "factor":
      return "Schwellen-Pace × Faktor";
    case "vo2max-anchor":
      return "Intervall-Anker";
    case "garmin-marathon":
      return "Garmin-Marathon-Prognose";
    case "goal":
      return "Ziel (manuell)";
    default:
      return "—";
  }
}

// "4:15" → 255 sec/km. Akzeptiert m:ss (auch ohne führende Null). null bei Unsinn.
function parsePaceToSec(input: string): number | null {
  const t = input.trim();
  if (t === "") return null;
  const m = t.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  if (sec < 150 || sec > 660) return null; // 2:30–11:00 /km
  return sec;
}

// LTHR liegt bei Trainierten ~85–92 % der HFmax. Mit ~88 % lässt sich aus der
// LTHR eine HFmax schätzen — nur als Brücke zum geläufigen %-HFmax-Modell
// ("Zone 2 = 60–70 % HFmax"), NICHT als Zonen-Anker.
const LTHR_PCT_OF_HRMAX = 0.88;

function estimateHrMax(lthr: number | null): number | null {
  return lthr != null ? Math.round(lthr / LTHR_PCT_OF_HRMAX) : null;
}

function pctHrMaxText(
  hrLo: number | null,
  hrHi: number | null,
  hrMax: number | null,
): string | null {
  if (hrMax == null || hrMax <= 0) return null;
  const lo = hrLo != null ? Math.round((hrLo / hrMax) * 100) : null;
  const hi = hrHi != null ? Math.round((hrHi / hrMax) * 100) : null;
  if (lo != null && hi != null) return `${lo}–${hi} %`;
  if (hi != null) return `< ${hi} %`;
  if (lo != null) return `≥ ${lo} %`;
  return null;
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function parseIntInRange(input: string, min: number, max: number): number | null {
  const n = Number(input.trim());
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}
