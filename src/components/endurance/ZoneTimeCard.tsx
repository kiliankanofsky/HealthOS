"use client";

import { useMemo, useState } from "react";

import type { RunLap } from "@/lib/db/schema";
import type { HrZones } from "@/lib/endurance/plan";
import { cn } from "@/lib/utils";

import {
  getCutoffIso,
  PeriodPicker,
  RANGE_TITLE,
  type Range,
} from "./PeriodPicker";

// Minimale Run-Felder für die Zonen-Auswertung.
type RunForZones = {
  date: string;
  durationSeconds: number;
  avgHeartRate: number | null;
  lapsJson: RunLap[] | null;
};

type Props = {
  runs: RunForZones[];
  hrZones: HrZones | null;
};

// Konsistente Zone-Farben mit TrainingZoneCalculator.
const ZONE_CONFIG = [
  {
    key: "z1" as const,
    label: "Recovery",
    barClass: "bg-sky-400",
    barBgClass: "bg-sky-100 dark:bg-sky-950/60",
  },
  {
    key: "z2" as const,
    label: "Endurance",
    barClass: "bg-emerald-500",
    barBgClass: "bg-emerald-50 dark:bg-emerald-950/60",
  },
  {
    key: "z3" as const,
    label: "Marathon",
    barClass: "bg-amber-500",
    barBgClass: "bg-amber-50 dark:bg-amber-950/60",
  },
  {
    key: "z4" as const,
    label: "Threshold",
    barClass: "bg-orange-600",
    barBgClass: "bg-orange-50 dark:bg-orange-950/60",
  },
  {
    key: "z5" as const,
    label: "VO₂max",
    barClass: "bg-rose-600",
    barBgClass: "bg-rose-50 dark:bg-rose-950/60",
  },
] as const;

type ZoneKey = (typeof ZONE_CONFIG)[number]["key"];

export function ZoneTimeCard({ runs, hrZones }: Props) {
  const [range, setRange] = useState<Range>("1w");

  const cutoffIso = useMemo(() => getCutoffIso(range), [range]);

  const zoneTimes = useMemo(
    () =>
      hrZones
        ? computeTimeInZones(
            cutoffIso ? runs.filter((r) => r.date >= cutoffIso) : runs,
            hrZones,
          )
        : null,
    [runs, hrZones, cutoffIso],
  );

  const title = RANGE_TITLE[range];
  const subtitle = `ZEIT IN ZONEN · ${title.toUpperCase()}`;

  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {subtitle}
        </p>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {!hrZones ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Keine Trainingszonen verfügbar — Garmin-Sync mit LTHR-Daten erforderlich.
        </p>
      ) : !zoneTimes || zoneTimes.total === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Keine Lauf-Daten mit HF-Werten für diesen Zeitraum.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {ZONE_CONFIG.map((cfg) => {
            const secs = zoneTimes.byZone[cfg.key];
            const pct = zoneTimes.total > 0 ? secs / zoneTimes.total : 0;
            const hrLabel = formatHrRange(cfg.key, hrZones);
            return (
              <li key={cfg.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-foreground">
                      {cfg.label}
                    </span>
                    {hrLabel && (
                      <span className="text-xs text-muted-foreground">
                        {hrLabel}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-foreground">
                    {formatTime(secs)}
                  </span>
                </div>
                {/* Progress bar */}
                <div
                  className={cn(
                    "relative h-1.5 w-full overflow-hidden rounded-full",
                    cfg.barBgClass,
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                      cfg.barClass,
                    )}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---- Berechnung ----

type ZoneTimes = {
  byZone: Record<ZoneKey, number>;
  total: number;
};

function computeTimeInZones(
  runs: RunForZones[],
  hrZones: HrZones,
): ZoneTimes {
  const byZone: Record<ZoneKey, number> = {
    z1: 0,
    z2: 0,
    z3: 0,
    z4: 0,
    z5: 0,
  };

  for (const run of runs) {
    const laps = run.lapsJson;
    if (laps && laps.length > 0) {
      for (const lap of laps) {
        if (lap.avgHr == null || lap.durationSec <= 0) continue;
        const zone = classifyHr(lap.avgHr, hrZones);
        if (zone) byZone[zone] += lap.durationSec;
      }
    } else if (run.avgHeartRate != null && run.durationSeconds > 0) {
      const zone = classifyHr(run.avgHeartRate, hrZones);
      if (zone) byZone[zone] += run.durationSeconds;
    }
  }

  const total = Object.values(byZone).reduce((s, v) => s + v, 0);
  return { byZone, total };
}

// Klassifiziert eine HR in eine Zone anhand der maxBpm-Grenzen (oben-exklusiv).
// Z1 nach unten offen, Z5 nach oben offen. Lücken zwischen den Zonen fallen
// der nächst-höheren Zone zu (konservativ).
function classifyHr(hr: number, zones: HrZones): ZoneKey | null {
  if (zones.z1.maxBpm == null) return null;
  if (hr <= zones.z1.maxBpm) return "z1";
  if (zones.z2.maxBpm == null) return null;
  if (hr <= zones.z2.maxBpm) return "z2";
  if (zones.z3.maxBpm == null) return null;
  if (hr <= zones.z3.maxBpm) return "z3";
  if (zones.z4.maxBpm == null) return null;
  if (hr <= zones.z4.maxBpm) return "z4";
  return "z5";
}

// ---- Formatter ----

function formatTime(secs: number): string {
  if (secs < 60) return "< 1 min";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")} min`;
  return `${m} min`;
}

function formatHrRange(zone: ZoneKey, hrZones: HrZones): string | null {
  const z = hrZones[zone];
  const lo = z.minBpm != null ? Math.round(z.minBpm) : null;
  const hi = z.maxBpm != null ? Math.round(z.maxBpm) : null;
  if (lo != null && hi != null) return `${lo}–${hi} bpm`;
  if (hi != null) return `< ${hi} bpm`;
  if (lo != null) return `> ${lo} bpm`;
  return null;
}
