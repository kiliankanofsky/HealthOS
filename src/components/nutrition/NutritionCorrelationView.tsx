"use client";

import { ChevronLeft, ChevronRight, Layers, Watch } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type {
  DailyActivity,
  DailyTag,
  NutritionEntry,
  NutritionExclusion,
  WeightEntry,
} from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { toLocalISODate } from "@/lib/utils/date";
import { buildExclusionLookup } from "@/lib/utils/nutrition-exclusions";

type Range = "1w" | "4w" | "8w" | "3m" | "max";

const OPTIONS: { value: Range; label: string }[] = [
  { value: "1w", label: "Woche" },
  { value: "4w", label: "4 Wochen" },
  { value: "8w", label: "8 Wochen" },
  { value: "3m", label: "3 Monate" },
  { value: "max", label: "Max" },
];

const DAYS_BY_RANGE: Record<Range, number | null> = {
  "1w": 7,
  "4w": 28,
  "8w": 56,
  "3m": 90,
  max: null,
};

const NUTRITION_GREEN = "#10b981";
const NUTRITION_GREEN_GHOST = "rgba(16, 185, 129, 0.45)";
const GARMIN_ORANGE = "#f97316";
const MAINTENANCE_AMBER = "#d97706";
const WEIGHT_BLUE = "#007AFF";
const DEFICIT_FILL = "rgba(16, 185, 129, 0.18)"; // dezent grünlich
const SURPLUS_FILL = "rgba(0, 122, 255, 0.18)"; // dezent blaulich
const TAG_COLOR = "#E11D48";

// 7-Tage-Trailing-SMA. Mindestens 4 von 7 Tagen müssen Daten haben — sonst
// null, damit am linken Rand keine Phantom-Werte entstehen.
function trailingSMA(values: (number | null)[], window = 7, minCount = 4) {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = values[j];
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    if (count >= minCount) out[i] = sum / count;
  }
  return out;
}

type Props = {
  nutrition: NutritionEntry[];
  weight: WeightEntry[];
  tags: DailyTag[];
  activity: DailyActivity[];
  /**
   * Manuell ausgeschlossene Zeiträume (sporadisches fddb-Tracking). Ihre Tage
   * liefern keinen Intake — weder für die Linie noch für die Kacheln oder die
   * Maintenance-Schätzung. Gleiche Behandlung wie ein Cheat-Day ohne Tracking.
   */
  exclusions: NutritionExclusion[];
};

type LayerKey = "intake" | "expenditure" | "maintenance" | "weight" | "tags";

type MergedPoint = {
  date: string;
  kcalIn: number | null;
  kcalOut: number | null;
  kcalOutSmoothed: number | null;
  activeKcal: number | null;
  bmrKcal: number | null;
  weight: number | null;
  cheatDay: boolean;
  cheatMeal: boolean;
  alcohol: boolean;
  excluded: boolean;
};

export function NutritionCorrelationView({
  nutrition,
  weight,
  tags,
  activity,
  exclusions,
}: Props) {
  const [range, setRange] = useState<Range>("8w");
  const [windowOffset, setWindowOffset] = useState(0);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    intake: true,
    expenditure: true,
    maintenance: true,
    weight: false,
    tags: true,
  });
  const toggleLayer = (key: LayerKey) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  // Merge: alle Datumspunkte vereinen + Cheat-Logik für Aufgenommen anwenden.
  // SMA-7 wird über die VOLLE Datenreihe gerechnet (vor Filterung), damit die
  // Linie am linken Rand nicht springt.
  const merged = useMemo<MergedPoint[]>(() => {
    // Heutiger Tag wird ausgeschlossen: er enthält nur partielle Garmin-
    // Daten, was die 7d-SMA der Verbrauchs-Linie an einem unvollständigen
    // Tag enden lässt — optisch irreführend.
    const today = toLocalISODate();
    const allDates = new Set<string>();
    for (const n of nutrition) if (n.date < today) allDates.add(n.date);
    for (const w of weight) if (w.date < today) allDates.add(w.date);
    for (const a of activity) if (a.date < today) allDates.add(a.date);
    // Tag-Tage einschließen, damit Cheat-Day-Marker auch ohne Weight/Nutrition
    // sichtbar bleiben.
    for (const t of tags) if (t.date < today) allDates.add(t.date);
    const sorted = Array.from(allDates).sort();

    const nByDate = new Map(nutrition.map((n) => [n.date, n]));
    const wByDate = new Map(weight.map((w) => [w.date, w]));
    const aByDate = new Map(activity.map((a) => [a.date, a]));
    const tByDate = new Map(tags.map((t) => [t.date, t]));
    const isExcluded = buildExclusionLookup(exclusions);

    const base = sorted.map((date) => {
      const w = wByDate.get(date);
      const n = nByDate.get(date);
      const a = aByDate.get(date);
      const t = tByDate.get(date);
      const cheatDay = t?.cheatDay ?? false;
      const cheatMeal = t?.cheatMeal ?? false;
      const target = t?.kcalTarget ?? null;
      const excluded = isExcluded(date);
      let kcalIn: number | null;
      if (excluded || cheatDay) {
        // Ausgeschlossen oder Cheat-Day → kein belastbarer Tageswert. Der
        // Verbrauch (Garmin) bleibt gültig, nur die Aufnahme fällt weg.
        kcalIn = null;
      } else if (cheatMeal && target != null) {
        kcalIn = target;
      } else {
        kcalIn = n?.caloriesKcal ?? null;
      }
      return {
        date,
        kcalIn,
        kcalOut: a?.totalKcal ?? null,
        activeKcal: a?.activeKcal ?? null,
        bmrKcal: a?.bmrKcal ?? null,
        weight: w?.weightKg ?? null,
        cheatDay,
        cheatMeal,
        alcohol: t?.alcohol ?? false,
        excluded,
      };
    });

    const smoothed = trailingSMA(base.map((p) => p.kcalOut));
    return base.map((p, i) => ({ ...p, kcalOutSmoothed: smoothed[i] }));
  }, [nutrition, weight, tags, activity, exclusions]);

  useEffect(() => {
    setWindowOffset(0);
  }, [range]);

  const days = DAYS_BY_RANGE[range];
  const maxOffset = useMemo(() => {
    if (days === null || merged.length === 0) return 0;
    const lastDate = new Date(merged[merged.length - 1].date);
    const firstDate = new Date(merged[0].date);
    const totalDays =
      Math.floor((lastDate.getTime() - firstDate.getTime()) / 86_400_000) + 1;
    return Math.max(0, totalDays - days);
  }, [days, merged]);

  const filtered = useMemo(() => {
    if (days === null || merged.length === 0) return merged;
    const lastDate = merged[merged.length - 1].date;
    const end = new Date(lastDate);
    end.setDate(end.getDate() - windowOffset);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return merged.filter((p) => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    });
  }, [merged, days, windowOffset]);

  // Ghost-Werte für die Aufgenommen-Linie an Lücken-Blöcken (Cheat-Day ODER
  // ausgeschlossener Zeitraum — beide liefern keinen Tageswert).
  //
  // Damit zwei benachbarte Cheat-Blöcke, die nur EINEN echten Datenpunkt
  // teilen, nicht als durchgehende gestrichelte Linie erscheinen (was 3
  // Cheat-Days suggerieren würde), schreiben wir abwechselnd in zwei
  // Datenreihen ghostA/ghostB. Gemeinsame Anker landen in beiden Reihen — am
  // gemeinsamen Punkt entstehen zwei separate Segment-Endpunkte statt einer
  // durchgehenden Linie. Zusätzlich markiert isRealBetweenCheats die
  // dazwischenliegenden Datenpunkte für einen sichtbaren grünen Dot.
  const { kcalInGhostA, kcalInGhostB, isRealBetweenCheats } = useMemo(() => {
    const ghostA = new Array<number | undefined>(filtered.length).fill(undefined);
    const ghostB = new Array<number | undefined>(filtered.length).fill(undefined);
    const between = new Array<boolean>(filtered.length).fill(false);

    const isBlocked = (p: MergedPoint) => p.cheatDay || p.excluded;

    type Block = { start: number; end: number };
    const blocks: Block[] = [];
    let i = 0;
    while (i < filtered.length) {
      if (isBlocked(filtered[i])) {
        const start = i;
        while (i < filtered.length && isBlocked(filtered[i])) i++;
        blocks.push({ start, end: i - 1 });
      } else {
        i++;
      }
    }

    for (let b = 0; b < blocks.length; b++) {
      const target = b % 2 === 0 ? ghostA : ghostB;
      const { start, end } = blocks[b];
      let prev = start - 1;
      while (
        prev >= 0 &&
        (isBlocked(filtered[prev]) || filtered[prev].kcalIn === null)
      ) {
        prev--;
      }
      let next = end + 1;
      while (
        next < filtered.length &&
        (isBlocked(filtered[next]) || filtered[next].kcalIn === null)
      ) {
        next++;
      }
      const prevV =
        prev >= 0 ? (filtered[prev].kcalIn as number | null) : null;
      const nextV =
        next < filtered.length ? (filtered[next].kcalIn as number | null) : null;
      if (prevV !== null) target[prev] = prevV;
      if (nextV !== null) target[next] = nextV;
      if (prevV !== null && nextV !== null) {
        for (let k = start; k <= end; k++) {
          const t = (k - prev) / (next - prev);
          target[k] = prevV + (nextV - prevV) * t;
        }
      } else if (prevV !== null) {
        for (let k = start; k <= end; k++) target[k] = prevV;
      } else if (nextV !== null) {
        for (let k = start; k <= end; k++) target[k] = nextV;
      }
    }

    // Markiere echte Datenpunkte, deren direkter Nachbar ein Lücken-Tag ist.
    // Die werden in der normalen Linie als sichtbarer Dot dargestellt.
    for (let k = 0; k < filtered.length; k++) {
      if (isBlocked(filtered[k]) || filtered[k].kcalIn === null) continue;
      const prevIsBlocked = k > 0 && isBlocked(filtered[k - 1]);
      const nextIsBlocked =
        k < filtered.length - 1 && isBlocked(filtered[k + 1]);
      if (prevIsBlocked || nextIsBlocked) between[k] = true;
    }

    return { kcalInGhostA: ghostA, kcalInGhostB: ghostB, isRealBetweenCheats: between };
  }, [filtered]);

  // Pro Datenpunkt: Bereich für Defizit-/Überschuss-Fläche (relativ zur
  // geglätteten Verbrauchs-Linie — dem ehrlicheren Vergleichswert).
  // Recharts Area unterstützt Tupel [low, high] als dataKey-Wert.
  const chartData = useMemo(() => {
    return filtered.map((p, i) => {
      let deficitRange: [number, number] | null = null;
      let surplusRange: [number, number] | null = null;
      const out = p.kcalOutSmoothed;
      if (p.kcalIn !== null && out !== null) {
        if (p.kcalIn < out) deficitRange = [p.kcalIn, out];
        else if (p.kcalIn > out) surplusRange = [out, p.kcalIn];
      }
      return {
        date: p.date,
        kcalIn: p.kcalIn,
        kcalInGhostA: kcalInGhostA[i],
        kcalInGhostB: kcalInGhostB[i],
        isRealBetweenCheats: isRealBetweenCheats[i],
        kcalOut: p.kcalOut,
        kcalOutSmoothed: p.kcalOutSmoothed,
        activeKcal: p.activeKcal,
        bmrKcal: p.bmrKcal,
        weight: p.weight,
        deficitRange,
        surplusRange,
        cheatDay: p.cheatDay,
        cheatMeal: p.cheatMeal,
        alcohol: p.alcohol,
        excluded: p.excluded,
      };
    });
  }, [filtered, kcalInGhostA, kcalInGhostB, isRealBetweenCheats]);

  // Stats für die Kacheln + Maintenance-Schätzung (Wishnofsky, 7700 kcal/kg).
  const stats = useMemo(() => {
    const inVals = filtered
      .map((p) => p.kcalIn)
      .filter((v): v is number => v !== null);
    const outVals = filtered
      .map((p) => p.kcalOut)
      .filter((v): v is number => v !== null);
    const activeVals = filtered
      .map((p) => p.activeKcal)
      .filter((v): v is number => v !== null);
    const balances = filtered
      .filter((p) => p.kcalIn !== null && p.kcalOut !== null)
      .map((p) => (p.kcalIn as number) - (p.kcalOut as number));
    const weightPoints = filtered
      .filter((p) => p.weight !== null)
      .map((p) => ({ date: p.date, w: p.weight as number }));
    const weightStart = weightPoints[0]?.w ?? null;
    const weightEnd = weightPoints[weightPoints.length - 1]?.w ?? null;

    // Maintenance-Schätzung: Ø Intake − (Δgewicht × 7700) / n_days.
    // Gewichts-Anker werden über bis zu 3 Tage am jeweiligen Rand gemittelt
    // (Wasser/Glykogen-Rauschen). Mindest-Anforderungen: 7 Tage Fenster,
    // 4 Intake-Tage, 2 Gewichts-Anker — sonst null.
    let maintenance: number | null = null;
    let maintenanceDays = 0;
    if (filtered.length > 0) {
      const winDays =
        Math.floor(
          (new Date(filtered[filtered.length - 1].date).getTime() -
            new Date(filtered[0].date).getTime()) /
            86_400_000,
        ) + 1;
      if (winDays >= 7 && inVals.length >= 4 && weightPoints.length >= 2) {
        const meanIntake = inVals.reduce((a, b) => a + b, 0) / inVals.length;
        const startSlice = weightPoints.slice(0, Math.min(3, weightPoints.length));
        const endSlice = weightPoints.slice(-Math.min(3, weightPoints.length));
        const wStart =
          startSlice.reduce((a, b) => a + b.w, 0) / startSlice.length;
        const wEnd = endSlice.reduce((a, b) => a + b.w, 0) / endSlice.length;
        maintenance = Math.round(
          meanIntake - ((wEnd - wStart) * 7700) / winDays,
        );
        maintenanceDays = winDays;
      }
    }

    return {
      avgIn:
        inVals.length > 0
          ? Math.round(inVals.reduce((a, b) => a + b, 0) / inVals.length)
          : null,
      avgOut:
        outVals.length > 0
          ? Math.round(outVals.reduce((a, b) => a + b, 0) / outVals.length)
          : null,
      avgActive:
        activeVals.length > 0
          ? Math.round(activeVals.reduce((a, b) => a + b, 0) / activeVals.length)
          : null,
      avgBalance:
        balances.length > 0
          ? Math.round(balances.reduce((a, b) => a + b, 0) / balances.length)
          : null,
      weightDelta:
        weightStart !== null && weightEnd !== null
          ? weightEnd - weightStart
          : null,
      maintenance,
      maintenanceDays,
      // Wie breit ist die Intake-Basis wirklich? Ohne diese Zahl liest sich ein
      // Ø über 4 verbliebene Tage wie ein Ø über das ganze Fenster.
      intakeDayCount: inVals.length,
      excludedDayCount: filtered.filter((p) => p.excluded).length,
    };
  }, [filtered]);

  // Swipe-Navigation (reverse: gleiches Verhalten wie WeightChartSection).
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const accumDeltaRef = useRef(0);
  const lastShiftRef = useRef(0);

  const shiftWindow = (direction: 1 | -1) => {
    if (days === null) return;
    setWindowOffset((prev) => {
      const next = prev + direction * days;
      if (next < 0) return 0;
      if (next > maxOffset) return maxOffset;
      return next;
    });
  };

  useEffect(() => {
    const el = swipeRef.current;
    if (!el || days === null) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      accumDeltaRef.current += e.deltaX;
      const now = Date.now();
      if (Math.abs(accumDeltaRef.current) < 50) return;
      if (now - lastShiftRef.current < 250) return;
      const direction: 1 | -1 = accumDeltaRef.current > 0 ? -1 : 1;
      accumDeltaRef.current = 0;
      lastShiftRef.current = now;
      shiftWindow(direction);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [days, maxOffset]);

  const windowLabel = useMemo(() => {
    if (filtered.length === 0) return "";
    const first = filtered[0].date;
    const last = filtered[filtered.length - 1].date;
    if (first === last) return formatShort(first);
    return `${formatShort(first)} – ${formatShort(last)}`;
  }, [filtered]);

  // Nur zeigen, wenn Ausschlüsse die Basis tatsächlich verschmälern — sonst
  // wäre es eine Zahl ohne Aussage unter jeder Kachel.
  const intakeBasisLabel =
    stats.excludedDayCount > 0
      ? `${stats.intakeDayCount} Tage · ${stats.excludedDayCount} ausgeschl.`
      : undefined;

  const canShiftOlder = days !== null && windowOffset < maxOffset;
  const canShiftNewer = days !== null && windowOffset > 0;

  if (filtered.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Keine Daten im gewählten Zeitraum.
      </div>
    );
  }

  // Gewichts-Y-Domain.
  const weights = filtered
    .map((p) => p.weight)
    .filter((v): v is number => v !== null);
  const wMin = weights.length > 0 ? Math.floor(Math.min(...weights) - 0.5) : 0;
  const wMax = weights.length > 0 ? Math.ceil(Math.max(...weights) + 0.5) : 100;

  // Kalorien-Y-Domain — etwas extra oben für Cheat-Day-Indikator.
  // Domain stützt sich auf die geglättete Verbrauchs-Linie (sichtbar) + Intake +
  // ggf. Maintenance-Referenz, nicht auf rohe Tageswerte.
  const kcalVals: number[] = [];
  for (const p of filtered) {
    if (p.kcalIn !== null) kcalVals.push(p.kcalIn);
    if (p.kcalOutSmoothed !== null) kcalVals.push(p.kcalOutSmoothed);
  }
  if (stats.maintenance !== null) kcalVals.push(stats.maintenance);
  const kcalMinRaw = kcalVals.length > 0 ? Math.min(...kcalVals) : 0;
  const kcalMaxRaw = kcalVals.length > 0 ? Math.max(...kcalVals) : 3000;
  const kcalMin = Math.max(0, Math.floor((kcalMinRaw - 200) / 200) * 200);
  const kcalMax = Math.ceil((kcalMaxRaw + 400) / 200) * 200;
  const cheatDayY = kcalMax - 100;

  // Cheat-Day-Marker als separate Datenspur.
  const chartDataWithMarkers = chartData.map((p) => ({
    ...p,
    cheatDayMarker: p.cheatDay && layers.tags ? cheatDayY : undefined,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Energiebilanz × Gewicht
        </p>
        <div className="flex items-center gap-2">
          <SegmentedControl
            options={OPTIONS}
            value={range}
            onChange={setRange}
            size="sm"
          />
          <LayerPopover layers={layers} onToggle={toggleLayer} />
        </div>
      </div>

      {/* Stat-Kacheln: 6 Werte — auf Mobile 2-spaltig, sm 3-spaltig, lg in einer Reihe. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Ø Aufgenommen"
          value={stats.avgIn !== null ? `${stats.avgIn.toLocaleString("de-DE")} kcal` : "—"}
          accent="text-emerald-700"
          sub={intakeBasisLabel}
        />
        <StatTile
          label="Ø Verbraucht"
          value={
            stats.avgOut !== null ? `${stats.avgOut.toLocaleString("de-DE")} kcal` : "—"
          }
          accent="text-orange-600"
        />
        <StatTile
          label="Ø Aktiv"
          value={
            stats.avgActive !== null
              ? `${stats.avgActive.toLocaleString("de-DE")} kcal`
              : "—"
          }
          accent="text-orange-500"
        />
        <StatTile
          label="Ø Bilanz"
          value={
            stats.avgBalance !== null
              ? `${stats.avgBalance > 0 ? "+" : ""}${stats.avgBalance.toLocaleString("de-DE")} kcal`
              : "—"
          }
          accent={
            stats.avgBalance === null
              ? "text-muted-foreground"
              : stats.avgBalance > 0
                ? "text-blue-600"
                : "text-emerald-700"
          }
        />
        <StatTile
          label="Geschätzte Maintenance"
          value={
            stats.maintenance !== null
              ? `${stats.maintenance.toLocaleString("de-DE")} kcal · ${stats.maintenanceDays} d`
              : "—"
          }
          accent="text-amber-600"
          sub={intakeBasisLabel}
        />
        <StatTile
          label="Δ Gewicht"
          value={
            stats.weightDelta !== null
              ? `${stats.weightDelta > 0 ? "+" : ""}${stats.weightDelta.toFixed(1).replace(".", ",")} kg`
              : "—"
          }
          accent="text-blue-600"
        />
      </div>

      <div
        ref={swipeRef}
        className="space-y-2"
        title="Horizontal swipen: vor/zurück im Zeitfenster"
      >
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartDataWithMarkers}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid stroke="currentColor" opacity={0.07} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) => formatTickDate(value)}
                minTickGap={32}
              />
              <YAxis
                yAxisId="kcal"
                domain={[kcalMin, kcalMax]}
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => v.toLocaleString("de-DE")}
              />
              <YAxis
                yAxisId="weight"
                orientation="right"
                domain={[wMin, wMax]}
                tick={{
                  fontSize: 11,
                  fill: WEIGHT_BLUE,
                  opacity: layers.weight ? 0.7 : 0,
                }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
                content={<EnergyTooltip showWeight={layers.weight} />}
              />

              {/* Defizit-Fläche (grünlich): zwischen kcalIn (low) und kcalOut (high). */}
              <Area
                yAxisId="kcal"
                type="monotone"
                dataKey="deficitRange"
                stroke="none"
                fill={DEFICIT_FILL}
                isAnimationActive={false}
                connectNulls={false}
                activeDot={false}
                legendType="none"
              />
              {/* Überschuss-Fläche (blaulich): zwischen kcalOut (low) und kcalIn (high). */}
              <Area
                yAxisId="kcal"
                type="monotone"
                dataKey="surplusRange"
                stroke="none"
                fill={SURPLUS_FILL}
                isAnimationActive={false}
                connectNulls={false}
                activeDot={false}
                legendType="none"
              />

              {/* Ghost-Linien (zwei alternierende Reihen, damit benachbarte
                  Cheat-Blöcke mit geteiltem Anker NICHT als eine durchgehende
                  gestrichelte Linie erscheinen). */}
              <Line
                yAxisId="kcal"
                type="monotone"
                dataKey="kcalInGhostA"
                stroke={NUTRITION_GREEN_GHOST}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls={false}
                legendType="none"
                hide={!layers.intake}
              />
              <Line
                yAxisId="kcal"
                type="monotone"
                dataKey="kcalInGhostB"
                stroke={NUTRITION_GREEN_GHOST}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls={false}
                legendType="none"
                hide={!layers.intake}
              />

              {/* Aufgenommen (Tageswert). Sichtbarer Dot an Tagen, deren
                  Nachbar ein Cheat-Day ist — sonst würde der echte Datenpunkt
                  zwischen zwei Cheat-Bridges visuell untergehen. */}
              <Line
                yAxisId="kcal"
                type="monotone"
                dataKey="kcalIn"
                stroke={NUTRITION_GREEN}
                strokeWidth={2}
                dot={(props: DotRenderProps) => {
                  const { cx, cy, payload, index } = props;
                  if (typeof cx !== "number" || typeof cy !== "number") {
                    return <g key={`in-${index}`} />;
                  }
                  const isTag =
                    layers.tags &&
                    (payload?.cheatMeal === true || payload?.alcohol === true);
                  if (isTag) {
                    return (
                      <circle
                        key={`in-${index}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={TAG_COLOR}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  }
                  if (payload?.isRealBetweenCheats === true) {
                    return (
                      <circle
                        key={`in-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3}
                        fill={NUTRITION_GREEN}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  }
                  return <g key={`in-${index}`} />;
                }}
                isAnimationActive={false}
                connectNulls={false}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
                hide={!layers.intake}
              />

              {/* Verbrauch: 7-Tage-Trailing-SMA (Goldstandard für Wearable-TDEE). */}
              <Line
                yAxisId="kcal"
                type="monotone"
                dataKey="kcalOutSmoothed"
                stroke={GARMIN_ORANGE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
                hide={!layers.expenditure}
              />

              {/* Gewichtslinie. */}
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="weight"
                stroke={WEIGHT_BLUE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
                hide={!layers.weight}
              />

              {/* Maintenance-Referenzlinie (horizontal, geschätzter TDEE). */}
              {stats.maintenance !== null && layers.maintenance && (
                <ReferenceLine
                  yAxisId="kcal"
                  y={stats.maintenance}
                  stroke={MAINTENANCE_AMBER}
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                  label={{
                    value: `Maintenance ${stats.maintenance.toLocaleString("de-DE")}`,
                    position: "insideTopRight",
                    fill: MAINTENANCE_AMBER,
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                />
              )}

              {/* Cheat-Day-Marker oberhalb der Linien. */}
              <Line
                yAxisId="kcal"
                type="monotone"
                dataKey="cheatDayMarker"
                stroke="transparent"
                strokeWidth={0}
                isAnimationActive={false}
                activeDot={false}
                connectNulls={false}
                dot={(props: DotRenderProps) => {
                  const { cx, cy, payload, index } = props;
                  if (
                    !layers.tags ||
                    payload?.cheatDay !== true ||
                    typeof cx !== "number" ||
                    typeof cy !== "number"
                  ) {
                    return <g key={`cd-${index}`} />;
                  }
                  return (
                    <circle
                      key={`cd-${index}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={TAG_COLOR}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {days !== null && (
          <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <NavButton
              onClick={() => shiftWindow(1)}
              disabled={!canShiftOlder}
              aria-label="Vorheriger Zeitraum"
            >
              <ChevronLeft className="size-3.5" />
            </NavButton>
            <span className="tabular-nums">{windowLabel}</span>
            <NavButton
              onClick={() => shiftWindow(-1)}
              disabled={!canShiftNewer}
              aria-label="Nächster Zeitraum"
            >
              <ChevronRight className="size-3.5" />
            </NavButton>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Verbrauchs-Linie ist als 7-Tage-Trailing-Mittel geglättet
        (Goldstandard für Wearable-TDEE). Maintenance wird über die
        Wishnofsky-Beziehung (7700 kcal/kg) aus Intake + Gewichts-Trend
        zurückgerechnet. Tageswerte und Aufschlüsselung im Tooltip.
      </p>
    </div>
  );
}

type DotRenderProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: {
    cheatDay?: boolean;
    cheatMeal?: boolean;
    alcohol?: boolean;
    isRealBetweenCheats?: boolean;
  };
};

type TooltipPayloadItem = {
  payload?: {
    date?: string;
    kcalIn?: number | null;
    kcalOut?: number | null;
    kcalOutSmoothed?: number | null;
    activeKcal?: number | null;
    bmrKcal?: number | null;
    weight?: number | null;
    cheatDay?: boolean;
    cheatMeal?: boolean;
    alcohol?: boolean;
    excluded?: boolean;
  };
};

function EnergyTooltip({
  active,
  payload,
  showWeight,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  showWeight: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p?.date) return null;
  const fmt = (v: number) => v.toLocaleString("de-DE");
  return (
    <div className="min-w-[220px] rounded-xl border border-foreground/10 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 font-medium tabular-nums">
        {formatLabelDate(p.date)}
      </p>

      {p.kcalIn != null && (
        <TooltipRow
          color={NUTRITION_GREEN}
          label="Aufgenommen"
          value={`${fmt(p.kcalIn)} kcal`}
        />
      )}

      {p.kcalOutSmoothed != null && (
        <TooltipRow
          color={GARMIN_ORANGE}
          label={
            <>
              Verbrauch <span className="text-muted-foreground">⌀ 7d</span>
            </>
          }
          value={`${fmt(Math.round(p.kcalOutSmoothed))} kcal`}
        />
      )}

      {p.kcalOut != null && (
        <div className="mt-1.5 rounded-md bg-muted/40 px-2 py-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              Verbrauch
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Watch className="size-2.5" aria-hidden /> Garmin
              </span>
            </span>
            <span className="tabular-nums">{fmt(p.kcalOut)} kcal</span>
          </div>
          {p.activeKcal != null && (
            <div className="mt-0.5 flex items-center justify-between gap-3 pl-3 text-[11px] text-muted-foreground">
              <span>↳ Aktiv</span>
              <span className="tabular-nums">{fmt(p.activeKcal)} kcal</span>
            </div>
          )}
          {p.bmrKcal != null && (
            <div className="flex items-center justify-between gap-3 pl-3 text-[11px] text-muted-foreground">
              <span>↳ Passiv</span>
              <span className="tabular-nums">{fmt(p.bmrKcal)} kcal</span>
            </div>
          )}
        </div>
      )}

      {showWeight && p.weight != null && (
        <div className="mt-1.5">
          <TooltipRow
            color={WEIGHT_BLUE}
            label="Gewicht"
            value={`${p.weight.toFixed(1).replace(".", ",")} kg`}
          />
        </div>
      )}

      {p.excluded && (
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Zeitraum ausgeschlossen · Aufnahme zählt nicht
        </p>
      )}

      {(p.cheatDay || p.cheatMeal || p.alcohol) && (
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-rose-600">
          {[
            p.cheatDay && "Cheat-Day",
            p.cheatMeal && "Cheat-Meal",
            p.alcohol && "Alkohol",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: React.ReactNode;
  value: string;
}) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">
        <Dot color={color} /> {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 rounded-full"
      style={{ background: color }}
    />
  );
}

function LayerPopover({
  layers,
  onToggle,
}: {
  layers: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
}) {
  const items: { key: LayerKey; label: string; color: string }[] = [
    { key: "intake", label: "Aufgenommen", color: NUTRITION_GREEN },
    { key: "expenditure", label: "Verbrauch (7d)", color: GARMIN_ORANGE },
    { key: "maintenance", label: "Maintenance", color: MAINTENANCE_AMBER },
    { key: "weight", label: "Gewicht", color: WEIGHT_BLUE },
    { key: "tags", label: "Tag", color: TAG_COLOR },
  ];
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Linien ein-/ausblenden"
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-full transition-colors",
          "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
          "data-[popup-open]:bg-foreground/10 data-[popup-open]:text-foreground",
        )}
      >
        <Layers className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-1.5">
        <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Anzeige
        </p>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={layers[item.key]}
            onClick={() => onToggle(item.key)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
              "hover:bg-muted",
              !layers[item.key] && "text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <Dot color={item.color} />
              {item.label}
            </span>
            <span
              aria-hidden
              className={cn(
                "inline-flex size-4 items-center justify-center rounded border transition-colors",
                layers[item.key]
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/30",
              )}
            >
              {layers[item.key] && (
                <svg
                  viewBox="0 0 12 12"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function StatTile({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className={`mt-1 font-heading text-lg font-semibold tabular-nums tracking-tight ${accent}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{sub}</p>
      )}
    </div>
  );
}

function formatTickDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function formatLabelDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function NavButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

