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
// Training Zone Calculator — eine konsolidierte Übersicht.
//
// Datenquellen (alle, soweit verfügbar, automatisch kombiniert):
//   • LTHR aus Garmin (überschreibbar via Eingabe-Feld)
//   • Steady-Splits vergangener Läufe → Pace↔HF-Regression (Pace pro HF-Grenze)
//   • Intervall-Work-Splits → Z5-Anker (schnellste kumulativ ≥ 5 min)
//   • Garmin LT2-Pace (Algorithmus)
//   • Best-20-min-Pace (Race-/Tempolauf-Surrogat)
//
// Modell: Friel-Running (Z1 < 85 % LTHR, Z2 85-89, Z3 90-94, Z4 95-99, Z5 ≥ 100).
// Details (Methodik, Quellen, R², beobachtete Min) liegen im Popover je Zone
// bzw. im Methodik-Tooltip am Header — die Liste selbst bleibt knapp.
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
};

export function TrainingZoneCalculator({ estimation, defaultLthr }: Props) {
  const [lthrInput, setLthrInput] = useState(
    defaultLthr != null ? String(defaultLthr) : "",
  );
  const lthr = useMemo(
    () => parseIntInRange(lthrInput, 100, 220),
    [lthrInput],
  );

  const rows: ZoneRow[] | null = useMemo(() => {
    if (estimation == null || lthr == null) return null;
    return buildZoneRows(estimation, lthr);
  }, [estimation, lthr]);

  const hasAnyData =
    estimation != null &&
    (estimation.regression != null || estimation.thresholdPace != null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
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
        <MethodologyPopover estimation={estimation} />
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
                <ZoneTableRow key={row.zone.zone} row={row} estimation={estimation!} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ZoneTableRow({
  row,
  estimation,
}: {
  row: ZoneRow;
  estimation: ZoneEstimation;
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
      <td className="px-2 py-2.5 text-right text-xs tabular-nums whitespace-nowrap sm:px-4 sm:text-sm">
        {paceRangeText(row.paceFast, row.paceSlow)}
      </td>
      <td className="px-2 py-2.5 text-right text-xs tabular-nums whitespace-nowrap sm:px-4 sm:text-sm">
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
            <ZoneDetailContent row={row} estimation={estimation} />
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  );
}

function ZoneDetailContent({
  row,
  estimation,
}: {
  row: ZoneRow;
  estimation: ZoneEstimation;
}) {
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
        <dt className="text-muted-foreground">% LTHR</dt>
        <dd className="text-right tabular-nums">{pctRangeText(row.zone.hrPctLow, row.zone.hrPctHigh)}</dd>
        <dt className="text-muted-foreground">Pace-Quelle</dt>
        <dd className="text-right">{paceSourceLabel(row.paceSource)}</dd>
        <dt className="text-muted-foreground">Beobachtet</dt>
        <dd className="text-right tabular-nums">
          {row.evidenceMinutes > 0 ? `${row.evidenceMinutes} min` : "—"}
        </dd>
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

function MethodologyPopover({ estimation }: { estimation: ZoneEstimation | null }) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1.5 self-start rounded-full bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:self-end">
        <Info className="size-3.5" />
        Methodik &amp; Datenbasis
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top" align="end">
        <div className="space-y-2 text-xs leading-relaxed">
          <p className="font-medium text-foreground">
            Friel-Modell (Running), LTHR-verankert
          </p>
          <p className="text-muted-foreground">
            Z1 &lt; 85 % · Z2 85–89 % · Z3 90–94 % · Z4 95–99 % · Z5 ≥ 100 % LTHR.
          </p>
          {estimation != null && (
            <>
              <p className="pt-1 font-medium text-foreground">Datenbasis</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>
                  {estimation.steadyRunCount} Steady-Läufe (
                  {estimation.steadyLapCount} Splits) für die Pace↔HF-Regression
                </li>
                <li>
                  {estimation.intervalRunCount} strukturierte Einheiten (
                  {estimation.workLapCount} Work-Splits) für den Z5-Anker
                </li>
                <li>
                  Zeitraum {formatShortDate(estimation.fromIso)}–
                  {formatShortDate(estimation.toIso)}
                </li>
                {estimation.regression && (
                  <li>
                    Fit-Qualität R² ={" "}
                    {estimation.regression.r2.toFixed(2).replace(".", ",")}
                  </li>
                )}
              </ul>
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
    case "regression":
      return "Lauf-Regression";
    case "factor":
      return "Schwellen-Pace × Faktor";
    case "vo2max-anchor":
      return "Intervall-Anker";
    default:
      return "—";
  }
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
