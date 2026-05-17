"use client";

import { Cookie, Flame, Wine } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import type { NutritionEntry, WeightEntry } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  date: string | null;
  nutrition: NutritionEntry | null;
  weight: WeightEntry | null;
  garminTotalKcal: number | null;
  onClose: () => void;
};

export function NutritionDayDetailDialog({
  open,
  date,
  nutrition,
  weight,
  garminTotalKcal,
  onClose,
}: Props) {
  if (!date) return null;

  const kcal = nutrition?.caloriesKcal ?? null;
  const balance =
    kcal !== null && garminTotalKcal !== null ? kcal - garminTotalKcal : null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.CloseIconButton />
          <Dialog.Header
            title={formatLong(date)}
            description="Ernährung & Kalorienbilanz"
          />

          <div className="space-y-5">
            {nutrition ? (
              <>
                {/* Kalorien-Hero */}
                <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-[10px] font-medium tracking-[0.18em] text-emerald-700 uppercase">
                        Aufgenommen
                      </p>
                      <p className="mt-1 font-heading text-3xl font-semibold tabular-nums tracking-tight">
                        {nutrition.caloriesKcal.toLocaleString("de-DE")}
                        <span className="ml-1 text-base font-normal text-muted-foreground">
                          kcal
                        </span>
                      </p>
                    </div>
                    {garminTotalKcal !== null && balance !== null && (
                      <div className="text-right">
                        <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                          Bilanz
                        </p>
                        <p
                          className={cn(
                            "mt-1 font-heading text-2xl font-semibold tabular-nums tracking-tight",
                            balance > 0
                              ? "text-amber-600"
                              : balance < 0
                                ? "text-emerald-700"
                                : "text-foreground",
                          )}
                        >
                          {balance > 0 ? "+" : ""}
                          {balance.toLocaleString("de-DE")}
                          <span className="ml-1 text-base font-normal text-muted-foreground">
                            kcal
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                  {garminTotalKcal !== null && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Flame className="size-3.5 text-orange-500" />
                      Verbraucht (Garmin): {garminTotalKcal.toLocaleString("de-DE")} kcal
                    </p>
                  )}
                </div>

                {/* Makros */}
                <Field label="Makronährstoffe">
                  <div className="grid grid-cols-3 gap-2">
                    <MacroTile
                      label="Protein"
                      grams={nutrition.proteinG}
                      kcalPerG={4}
                      color="bg-rose-500/10 text-rose-700"
                    />
                    <MacroTile
                      label="Kohlenhydrate"
                      grams={nutrition.carbsG}
                      kcalPerG={4}
                      color="bg-amber-500/10 text-amber-700"
                    />
                    <MacroTile
                      label="Fett"
                      grams={nutrition.fatG}
                      kcalPerG={9}
                      color="bg-indigo-500/10 text-indigo-700"
                    />
                  </div>
                </Field>

                {(nutrition.fiberG !== null || nutrition.sugarG !== null) && (
                  <Field label="Davon">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {nutrition.fiberG !== null && (
                        <DetailRow
                          label="Ballaststoffe"
                          value={`${formatGram(nutrition.fiberG)} g`}
                        />
                      )}
                      {nutrition.sugarG !== null && (
                        <DetailRow
                          label="Zucker"
                          value={`${formatGram(nutrition.sugarG)} g`}
                        />
                      )}
                    </div>
                  </Field>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                Keine fddb-Einträge für diesen Tag.
              </div>
            )}

            {/* Gewicht + Tags vom Weight-Eintrag */}
            {weight && (
              <Field label="Tag im Weight-Logbuch">
                <div className="space-y-2">
                  <DetailRow
                    label="Gewicht"
                    value={`${weight.weightKg.toFixed(1).replace(".", ",")} kg`}
                  />
                  {(weight.cheatDay || weight.alcohol) && (
                    <div className="flex flex-wrap gap-2">
                      {weight.cheatDay && (
                        <TagBadge icon={<Cookie className="size-3" />} label="Cheat Day" />
                      )}
                      {weight.alcohol && (
                        <TagBadge icon={<Wine className="size-3" />} label="Alkohol" />
                      )}
                    </div>
                  )}
                  {weight.notes && (
                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      {weight.notes}
                    </p>
                  )}
                </div>
              </Field>
            )}

            <p className="text-[11px] text-muted-foreground">
              Tags (Cheat Day / Alkohol) werden auf der Weight-Seite gepflegt.
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function MacroTile({
  label,
  grams,
  kcalPerG,
  color,
}: {
  label: string;
  grams: number;
  kcalPerG: number;
  color: string;
}) {
  const kcal = Math.round(grams * kcalPerG);
  return (
    <div className={cn("rounded-xl p-3 ring-1 ring-inset ring-current/10", color)}>
      <p className="text-[10px] font-medium tracking-[0.16em] uppercase opacity-80">
        {label}
      </p>
      <p className="mt-1 font-heading text-lg font-semibold tabular-nums tracking-tight">
        {formatGram(grams)}
        <span className="ml-0.5 text-xs font-normal opacity-70">g</span>
      </p>
      <p className="mt-0.5 text-[10px] tabular-nums opacity-60">
        {kcal.toLocaleString("de-DE")} kcal
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

function TagBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-500/20">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function formatGram(g: number): string {
  return g.toFixed(1).replace(".", ",");
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("de-DE", { month: "long" });
  const year = d.getFullYear();
  return `${weekday}, ${day}. ${month} ${year}`;
}
