import {
  Flame,
  MoveDownRight,
  MoveRight,
  MoveUpRight,
  TriangleAlert,
} from "lucide-react";

import type { WeightPhase } from "@/lib/db/schema";
import type { NutritionRecommendation } from "@/lib/utils/nutrition-recommendation";
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
};

export function NutritionRecommendationCard({ rec }: Props) {
  if (rec.phaseKind == null) {
    return (
      <p className="rounded-2xl bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
        Keine aktive Phase hinterlegt — lege im Weight-Chart eine Cut-, Bulk-
        oder Maintenance-Phase an, um eine Kalorien-Empfehlung zu bekommen.
      </p>
    );
  }

  const hasNumbers =
    rec.adjustmentKcal != null && rec.recommendedIntakeKcal != null;

  return (
    <div className="space-y-5">
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
          sub={`${rec.intakeDayCount} Tage (14d-Fenster)`}
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
          Noch zu wenig Daten für eine konkrete Anpassung —{" "}
          {rec.observedWeeklyDeltaKg == null
            ? "es braucht mindestens je 2 Wiegungen in dieser und der vorigen Woche innerhalb der Phase"
            : "es braucht mindestens 4 fddb-Tage in den letzten 14 Tagen"}
          .
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
