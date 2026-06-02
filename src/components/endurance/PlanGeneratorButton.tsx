"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import {
  generatePlanSessions,
  wipePlanSessions,
} from "@/app/endurance/recommendations/actions";
import { Button } from "@/components/ui/button";
import type { AiModel } from "@/lib/endurance/ai-generator";

type Props = {
  planId: number;
  // Aktueller Stand der Sessions im Plan — wird zum Resume genutzt.
  existingPrimarySessionCount: number;
};

type RunProgress = {
  doneChunks: number;
  totalChunks: number | null;
  totalSessions: number;
  totalAlternatives: number;
  cacheReadTokens: number;
};

type Status =
  | { phase: "idle" }
  | { phase: "running"; progress: RunProgress; currentChunk: number }
  | { phase: "done"; progress: RunProgress }
  | { phase: "error"; error: string; progress: RunProgress | null };

const INITIAL_PROGRESS: RunProgress = {
  doneChunks: 0,
  totalChunks: null,
  totalSessions: 0,
  totalAlternatives: 0,
  cacheReadTokens: 0,
};

export function PlanGeneratorButton({
  planId,
  existingPrimarySessionCount,
}: Props) {
  const [model, setModel] = useState<AiModel>("sonnet");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [pending, startTransition] = useTransition();

  function runGeneration() {
    startTransition(async () => {
      let progress: RunProgress = { ...INITIAL_PROGRESS };
      let chunkIndex = 0;

      while (true) {
        setStatus({ phase: "running", progress, currentChunk: chunkIndex });
        const r = await generatePlanSessions(planId, { model, chunkIndex });

        if (!r.ok) {
          setStatus({
            phase: "error",
            error: r.error ?? "Unbekannter Fehler.",
            progress: { ...progress, totalChunks: r.totalChunks ?? progress.totalChunks },
          });
          return;
        }

        progress = {
          doneChunks: chunkIndex + 1,
          totalChunks: r.totalChunks ?? progress.totalChunks,
          totalSessions: progress.totalSessions + (r.generated?.sessions ?? 0),
          totalAlternatives:
            progress.totalAlternatives + (r.generated?.alternatives ?? 0),
          cacheReadTokens:
            progress.cacheReadTokens + (r.generated?.cacheReadTokens ?? 0),
        };

        if (r.isLast) {
          setStatus({ phase: "done", progress });
          return;
        }
        chunkIndex++;
      }
    });
  }

  function runReset() {
    startTransition(async () => {
      const r = await wipePlanSessions(planId);
      if (!r.ok) {
        setStatus({
          phase: "error",
          error: r.error ?? "Reset fehlgeschlagen.",
          progress: null,
        });
        return;
      }
      setStatus({ phase: "idle" });
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
            Claude generiert die Sessions in 4 Chunks à 4 Wochen — jeder Chunk
            ist ein separater API-Call (Vercel-60s-Limit). Insgesamt ca. 2–4 Min.
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

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runGeneration} disabled={pending}>
          {pending && status.phase === "running"
            ? `Generiere Chunk ${status.currentChunk + 1}${status.progress.totalChunks ? ` / ${status.progress.totalChunks}` : ""}…`
            : existingPrimarySessionCount > 0
              ? "Generierung fortsetzen"
              : "Plan generieren"}
        </Button>
        {(existingPrimarySessionCount > 0 || status.phase === "error" || status.phase === "done") && (
          <Button
            variant="outline"
            onClick={runReset}
            disabled={pending}
            className="inline-flex items-center gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Sessions löschen
          </Button>
        )}
      </div>

      {status.phase === "running" && (
        <ProgressBox progress={status.progress} currentChunk={status.currentChunk} />
      )}
      {status.phase === "done" && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          ✓ {status.progress.totalSessions} Sessions +{" "}
          {status.progress.totalAlternatives} Alternativen über{" "}
          {status.progress.doneChunks} Chunks generiert. Cache-Reads:{" "}
          {status.progress.cacheReadTokens.toLocaleString("de-DE")} Tokens.
        </div>
      )}
      {status.phase === "error" && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
          <p>✕ {status.error}</p>
          {status.progress && status.progress.doneChunks > 0 && (
            <p className="mt-1 text-xs">
              {status.progress.doneChunks} von{" "}
              {status.progress.totalChunks ?? "?"} Chunks waren bereits
              erfolgreich. Du kannst über „Generierung fortsetzen" weitermachen
              oder „Sessions löschen" und neu starten.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBox({
  progress,
  currentChunk,
}: {
  progress: RunProgress;
  currentChunk: number;
}) {
  const total = progress.totalChunks ?? "?";
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">
        Generiere Chunk {currentChunk + 1} / {total}…
      </p>
      <p className="mt-1 text-xs">
        {progress.totalSessions} Sessions + {progress.totalAlternatives}{" "}
        Alternativen bisher fertig. Bleib auf der Seite — bei Wegklicken
        läuft's im Hintergrund aber die UI verliert den Fortschritt.
      </p>
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
