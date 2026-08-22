import {
  Activity,
  CalendarOff,
  Flame,
  MoveDownRight,
  MoveRight,
  MoveUpRight,
  Scale,
  TriangleAlert,
} from "lucide-react";

import type { WeightPhase } from "@/lib/db/schema";
import type {
  MaintenanceEstimate,
  NutritionRecommendation,
} from "@/lib/utils/nutrition-recommendation";
import { cn } from "@/lib/utils";

// Deterministische Kalorien-Empfehlung passend zur Weight-Phase.
// Reine Anzeige — die Berechnung lebt in lib/utils/nutrition-recommendation.

const PHASE_LABELS: Record<WeightPhase["kind"], string> = {
  cut: "Cut",
  bulk: "Bulk",
  maintenance: "Maintenance",
};

const PHASE_GOAL_HINT: Record<WeightPhase["kind"], string> = {
  cut: "Ziel-Rate: −0,5 % Körpergewicht pro Woche",
  bulk: "Ziel-Rate: +0,25 % Körpergewicht pro Woche",
  maintenance: "Ziel-Rate: Gewicht halten (±0)",
};

type Props = {
  rec: NutritionRecommendation;
  /** TDEE-Bilanz-Schätzung — nur in der Maintenance-Phase verwendet. */
  maintenance?: MaintenanceEstimate | null;
};

export function NutritionRecommendationCard({ rec, maintenance }: Props) {
  if (rec.phaseKind == null) {
    return (
      <p className="rounded-2xl bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
        Keine aktive Phase hinterlegt — lege im Weight-Chart eine Cut-, Bulk-
        oder Maintenance-Phase an, um eine Kalorien-Empfehlung zu bekommen.
      </p>
    );
  }

  // Erhaltungsphase: eigene Card-Optik (TDEE aus Energiebilanz + Garmin-Abgleich).
  if (rec.phaseKind === "maintenance" && maintenance) {
    return <MaintenanceCard est={maintenance} phaseStartDate={rec.phaseStartDate} />;
  }

  const hasNumbers =
    rec.adjustmentKcal != null && rec.recommendedIntakeKcal != null;

  return (
    <div className="space-y-5">
      <ExclusionNotice
        excludedDays={rec.excludedDaysInWindow}
        windowDays={rec.windowDays}
        blocking={rec.avgIntakeKcal == null}
      />
      <CheatDayNotice rec={rec} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Phase"
          value={PHASE_LABELS[rec.phaseKind]}
          sub={rec.phaseStartDate ? `seit ${formatDate(rec.phaseStartDate)}` : undefined}
        />
        <Stat
          label="Beobachtet"
          value={signedKg(rec.observedWeeklyDeltaKg)}
          sub="Δ pro Woche (Phase)"
        />
        <Stat
          label="Ziel"
          value={signedKg(rec.targetWeeklyDeltaKg)}
          sub="Δ pro Woche"
        />
        <Stat
          label="Ø Intake"
          value={rec.avgIntakeKcal != null ? `${rec.avgIntakeKcal} kcal` : "—"}
          sub={
            rec.excludedDaysInWindow > 0
              ? `${rec.intakeDayCount} Tage · ${rec.excludedDaysInWindow} ausgeschl.`
              : `${rec.intakeDayCount} Tage (${rec.windowDays}d-Fenster)`
          }
        />
      </div>

      {hasNumbers ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Flame className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                Empfohlenes Tagesziel
              </p>
              <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
                ~{rec.recommendedIntakeKcal!.toLocaleString("de-DE")} kcal
              </p>
            </div>
          </div>
          <AdjustmentPill kcal={rec.adjustmentKcal!} capped={rec.adjustmentCapped} />
        </div>
      ) : (
        <p className="rounded-2xl bg-muted/40 px-5 py-6 text-sm text-muted-foreground">
          Noch zu wenig Daten für eine konkrete Anpassung — {missingDataReason(rec)}.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {PHASE_GOAL_HINT[rec.phaseKind]}. Die Anpassung übersetzt die Differenz
        zwischen beobachteter und Ziel-Rate über die 7700-kcal-Regel (1 kg ≈
        7700 kcal) in ein tägliches Kalorien-Delta — gerundet auf 50 kcal,
        gedeckelt auf ±500 kcal. Basis ist die laufende Phase aus dem
        Weight-Chart.
      </p>
    </div>
  );
}

// ============================================================
// Maintenance-Variante — Erhaltungsbedarf (TDEE) aus Energiebilanz + Garmin.
// Eigene Optik: kein "+/− kcal anpassen", sondern eine Erhaltungs-Zahl, gestützt
// durch drei Zeitfenster (7/14/28 Tage) und Garmins gemessenen Verbrauch.
// ============================================================
function MaintenanceCard({
  est,
  phaseStartDate,
}: {
  est: MaintenanceEstimate;
  phaseStartDate: string | null;
}) {
  const hasNumber = est.recommendedMaintenanceKcal != null;
  return (
    <div className="space-y-5">
      <ExclusionNotice
        excludedDays={est.excludedDaysInWindow}
        windowDays={28}
        blocking={est.recommendedMaintenanceKcal == null}
      />
      <MaintenanceCheatNotice est={est} />

      {hasNumber ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-500/10 p-5 ring-1 ring-amber-500/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Flame className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                Erhaltungsbedarf{phaseStartDate ? ` · Phase seit ${formatDate(phaseStartDate)}` : ""}
              </p>
              <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
                ~{est.recommendedMaintenanceKcal!.toLocaleString("de-DE")} kcal
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  /Tag
                </span>
              </p>
            </div>
          </div>
          {est.garminMaintenanceKcal != null && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground sm:self-auto">
              <Activity className="size-4" />
              Garmin ~{est.garminMaintenanceKcal.toLocaleString("de-DE")} kcal
            </span>
          )}
        </div>
      ) : (
        <p className="rounded-2xl bg-muted/40 px-5 py-6 text-sm text-muted-foreground">
          Noch zu wenig Daten für eine Erhaltungs-Schätzung — es braucht in
          mindestens einem Fenster je ≥ 3 Wiegungen und ≥ 3 verwertbare
          Tracking-Tage.
          {est.excludedDaysInWindow > 0 &&
            ` Aktuell liegen ${est.excludedDaysInWindow} der letzten 28 Tage in einem ausgeschlossenen Zeitraum.`}
        </p>
      )}

      {/* Drei Zeitfenster nebeneinander. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {est.windows.map((w) => (
          <div key={w.days} className="rounded-2xl bg-muted/30 p-4">
            <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {w.days} Tage
            </p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Line
                icon={<Flame className="size-3.5" />}
                label="Ø Intake"
                value={w.avgIntakeKcal != null ? `${w.avgIntakeKcal} kcal` : "—"}
                sub={
                  w.excludedDayCount > 0
                    ? `${w.intakeDayCount} Tage · ${w.excludedDayCount} ausg.`
                    : `${w.intakeDayCount} Tage`
                }
              />
              <Line
                icon={<Scale className="size-3.5" />}
                label="Gewicht Δ"
                value={signedKg(w.weightDeltaKg)}
                sub={`${w.weightEntryCount} Wieg.`}
              />
              <Line
                label="Bilanz-TDEE"
                value={w.balanceTdeeKcal != null ? `${w.balanceTdeeKcal} kcal` : "—"}
                strong
              />
              <Line
                icon={<Activity className="size-3.5" />}
                label="Garmin"
                value={w.garminTdeeKcal != null ? `${w.garminTdeeKcal} kcal` : "—"}
                sub={`${w.garminDayCount} Tage`}
              />
            </dl>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Erhaltungsbedarf (TDEE) aus der Energiebilanz: Ø-Intake minus
        Gewichts-Rate × 7700 kcal/kg, über 7/14/28 Tage. Die konsolidierte Zahl
        ist der Median der validen Fenster. Garmins gemessener Tagesverbrauch
        dient als unabhängiger Abgleich — weichen beide stark ab, liegt es meist
        an unvollständigem Tracking. Längere Fenster sind robuster (weniger
        Wasser-Rauschen).
      </p>
    </div>
  );
}

function Line({
  icon,
  label,
  value,
  sub,
  strong,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          strong ? "font-semibold text-foreground" : "text-foreground/80",
        )}
      >
        {value}
        {sub && (
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            {sub}
          </span>
        )}
      </dd>
    </div>
  );
}

// Ausgeschlossene Zeiträume sind eine bewusste Einstellung, keine Störung —
// deshalb neutral gehalten. Erst wenn sie die Rechnung tatsächlich blockieren,
// wird der Hinweis deutlicher: sonst steht da nur ein "—" ohne Erklärung.
function ExclusionNotice({
  excludedDays,
  windowDays,
  blocking,
}: {
  excludedDays: number;
  windowDays: number;
  blocking: boolean;
}) {
  if (excludedDays === 0) return null;
  return (
    <div className="flex gap-2.5 rounded-2xl bg-muted/50 px-4 py-3 text-sm ring-1 ring-border">
      <CalendarOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">
          {excludedDays} von {windowDays} Tagen
        </span>{" "}
        im Berechnungsfenster liegen in einem ausgeschlossenen Zeitraum. Ihre
        fddb-Werte bleiben erhalten, zählen hier aber nicht als Aufnahme
        {blocking
          ? " — dadurch bleiben zu wenige verwertbare Tage für eine Zahl übrig."
          : "."}
      </p>
    </div>
  );
}

// Warum steht hier keine Zahl? Der Grund unterscheidet sich je nachdem, welche
// Seite der Rechnung fehlt — Wiegungen oder verwertbare Tracking-Tage.
function missingDataReason(rec: NutritionRecommendation): string {
  if (rec.observedWeeklyDeltaKg == null) {
    return "es braucht mindestens je 2 Wiegungen in dieser und der vorigen Woche innerhalb der Phase";
  }
  const usableDays = rec.windowDays - rec.excludedDaysInWindow;
  if (rec.excludedDaysInWindow > 0 && usableDays < 4) {
    return `von den letzten ${rec.windowDays} Tagen sind ${rec.excludedDaysInWindow} ausgeschlossen, es bleiben nur ${usableDays} mögliche Tracking-Tage (nötig sind 4)`;
  }
  return `es braucht mindestens 4 getrackte Tage in den letzten ${rec.windowDays} Tagen`;
}

function MaintenanceCheatNotice({ est }: { est: MaintenanceEstimate }) {
  if (est.cheatDaysInWindow === 0 && est.cheatMealsInWindow === 0) return null;
  const parts: string[] = [];
  if (est.cheatDaysInWindow > 0)
    parts.push(`${est.cheatDaysInWindow} Cheat-Day${est.cheatDaysInWindow > 1 ? "s" : ""}`);
  if (est.cheatMealsInWindow > 0)
    parts.push(`${est.cheatMealsInWindow} Cheat-Meal${est.cheatMealsInWindow > 1 ? "s" : ""}`);
  return (
    <div className="flex gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-amber-800/90 dark:text-amber-200/80">
        {parts.join(" · ")} in den letzten 28 Tagen — Cheat-Tage verzerren sowohl
        die Gewichts-Rate (Wasser) als auch den Ø-Intake. Erhaltungs-Schätzung
        entsprechend vorsichtig lesen.
      </p>
    </div>
  );
}

// Hinweis, wenn Cheat-Tags im Berechnungsfenster liegen: dann ist die
// deterministische Rechnung (Rate + Intake) zwangsläufig unsicher.
function CheatDayNotice({ rec }: { rec: NutritionRecommendation }) {
  if (rec.cheatDaysInWindow === 0 && rec.cheatMealsInWindow === 0) return null;
  const parts: string[] = [];
  if (rec.cheatDaysInWindow > 0)
    parts.push(`${rec.cheatDaysInWindow} Cheat-Day${rec.cheatDaysInWindow > 1 ? "s" : ""}`);
  if (rec.cheatMealsInWindow > 0)
    parts.push(`${rec.cheatMealsInWindow} Cheat-Meal${rec.cheatMealsInWindow > 1 ? "s" : ""}`);
  return (
    <div className="flex gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-0.5">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Rechnung nur eingeschränkt belastbar
        </p>
        <p className="text-amber-800/90 dark:text-amber-200/80">
          {parts.join(" · ")} in den letzten 14 Tagen — Cheat-Tage verzerren
          sowohl die beobachtete Gewichts-Rate (Wasser-Einlagerung) als auch den
          Ø-Intake. Empfehlung entsprechend vorsichtig interpretieren.
          {rec.cheatDayUnknownCount > 0 &&
            ` ${rec.cheatDayUnknownCount} Cheat-Day${rec.cheatDayUnknownCount > 1 ? "s" : ""} ohne Tracking wurde${rec.cheatDayUnknownCount > 1 ? "n" : ""} aus dem Schnitt herausgenommen.`}
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-muted/30 p-4">
      <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-heading text-lg font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AdjustmentPill({ kcal, capped }: { kcal: number; capped: boolean }) {
  const Icon = kcal > 0 ? MoveUpRight : kcal < 0 ? MoveDownRight : MoveRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm font-medium sm:self-auto",
        kcal > 0
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : kcal < 0
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
      {kcal === 0
        ? "Kalorien beibehalten"
        : `${kcal > 0 ? "+" : ""}${kcal} kcal/Tag${capped ? " (gedeckelt)" : ""}`}
    </span>
  );
}

function signedKg(v: number | null): string {
  if (v == null) return "—";
  const r = Math.round(v * 100) / 100;
  return `${r > 0 ? "+" : ""}${r.toFixed(2).replace(".", ",")} kg`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
