"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import {
  generatePlanSessions,
  type GeneratePlanState,
} from "@/app/endurance/recommendations/actions";
import { Button } from "@/components/ui/button";
import type { AiModel } from "@/lib/endurance/ai-generator";

type Props = {
  planId: number;
};

export function PlanGeneratorButton({ planId }: Props) {
  const [model, setModel] = useState<AiModel>("sonnet");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GeneratePlanState | null>(null);

  function onClick() {
    setResult(null);
    startTransition(async () => {
      const state = await generatePlanSessions(planId, { model });
      setResult(state);
    });
  }

  return (
    <div className="space-y-4 rounded-2xl bg-muted/40 p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 text-primary" />
        <div className="space-y-1">
          <h3 className="font-heading text-base font-medium">
            Plan mit KI generieren
          </h3>
          <p className="text-sm text-muted-foreground">
            Claude erstellt aus deinem Referenz-PDF + Plan-Settings die
            Sessions für alle Wochen. Dauert je nach Modell ca. 30–60 Sek.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Modell
        </label>
        <div className="flex flex-wrap gap-2">
          <ModelChip
            label="Sonnet 4.6"
            sub="schnell · günstig · für Test"
            active={model === "sonnet"}
            onClick={() => setModel("sonnet")}
            disabled={pending}
          />
          <ModelChip
            label="Opus 4.8"
            sub="langsamer · teurer · höchste Qualität"
            active={model === "opus"}
            onClick={() => setModel("opus")}
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onClick} disabled={pending}>
          {pending ? "Generiere… (kann bis 60s dauern)" : "Plan generieren"}
        </Button>
      </div>

      {result?.ok && result.generated && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          ✓ {result.generated.sessions} Sessions +{" "}
          {result.generated.alternatives} Alternativen generiert in{" "}
          {result.generated.chunks} Chunks. Cache-Reads:{" "}
          {result.generated.totalCacheReadTokens.toLocaleString("de-DE")}{" "}
          Tokens.
        </div>
      )}
      {result && !result.ok && result.error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
          ✕ {result.error}
        </div>
      )}
    </div>
  );
}

function ModelChip({
  label,
  sub,
  active,
  onClick,
  disabled,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-foreground/10 hover:border-foreground/30"
      }`}
    >
      <span className="block font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{sub}</span>
    </button>
  );
}
