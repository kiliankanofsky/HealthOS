"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  saveSessionEdits,
  type SaveSessionEditsInput,
  type SessionDetail,
} from "@/app/endurance/recommendations/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  trainingPlanSessionStatuses,
  trainingPlanSessionTypes,
  type TrainingPlanBlockSegmentKind,
  type TrainingPlanSessionStatus,
  type TrainingPlanSessionType,
} from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms, type PaceZones } from "@/lib/endurance/plan";
import {
  formatDistance,
  paceRangeForZone,
  SEGMENT_KIND_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
} from "@/lib/endurance/plan-format";
import { cn } from "@/lib/utils";

type Measure = "duration" | "distance";

type SegState = {
  kind: TrainingPlanBlockSegmentKind;
  measure: Measure;
  durationStr: string; // "m:ss" oder Minuten
  distanceStr: string; // Meter
  zone: number;
};

type BlockState = {
  repetitions: number;
  description: string;
  segments: SegState[];
};

type Props = {
  editingId: number | null;
  // Vom Parent vorgeladen (Event-Handler, nicht Effect — vermeidet
  // synchrones setState im Effect und remountet das Formular pro Session).
  detail: SessionDetail | null;
  loading: boolean;
  paceZones: PaceZones | null;
  onClose: () => void;
  onSaved: () => void;
};

const FIELD =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function EditSessionDialog({
  editingId,
  detail,
  loading,
  paceZones,
  onClose,
  onSaved,
}: Props) {
  const ready = !loading && detail != null && detail.session.id === editingId;

  return (
    <Dialog.Root
      open={editingId != null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="w-[min(660px,calc(100vw-32px))] max-h-[88vh] overflow-y-auto">
          <Dialog.CloseIconButton />
          <Dialog.Header
            title="Session bearbeiten"
            description="Titel, Typ und Status anpassen oder die Intervallstruktur ändern. Distanz und Dauer ergeben sich aus den Intervallen."
          />
          {ready ? (
            <SessionEditForm
              key={detail.session.id}
              detail={detail}
              paceZones={paceZones}
              onCancel={onClose}
              onSaved={onSaved}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lade Session…
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Eigene Komponente, per `key={sessionId}` remountet → State wird über
// useState-Initializer aus `detail` gesetzt, ohne Effect.
function SessionEditForm({
  detail,
  paceZones,
  onCancel,
  onSaved,
}: {
  detail: SessionDetail;
  paceZones: PaceZones | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(detail.session.title);
  const [sessionType, setSessionType] = useState<TrainingPlanSessionType>(
    detail.session.sessionType,
  );
  const [status, setStatus] = useState<TrainingPlanSessionStatus>(
    detail.session.status,
  );
  const [blocks, setBlocks] = useState<BlockState[]>(() =>
    detail.blocks.map(toBlockState),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patchBlock(bi: number, next: BlockState) {
    setBlocks((bs) => bs.map((b, i) => (i === bi ? next : b)));
  }
  function removeBlock(bi: number) {
    setBlocks((bs) => bs.filter((_, i) => i !== bi));
  }
  function addBlock() {
    setBlocks((bs) => [
      ...bs,
      {
        repetitions: 1,
        description: "",
        segments: [
          { kind: "work", measure: "duration", durationStr: "10:00", distanceStr: "", zone: 2 },
        ],
      },
    ]);
  }

  const totals = computeTotals(blocks);

  function handleSave() {
    setError(null);
    if (title.trim().length < 1) {
      setError("Titel fehlt.");
      return;
    }
    const built: SaveSessionEditsInput = {
      sessionId: detail.session.id,
      title,
      sessionType,
      status,
      blocks: blocks.map((b) => ({
        repetitions: b.repetitions,
        description: b.description.trim() || null,
        segments: b.segments.map((s) => ({
          kind: s.kind,
          zone: s.zone,
          durationSec: s.measure === "duration" ? parseDuration(s.durationStr) : null,
          distanceMeters: s.measure === "distance" ? parseDistance(s.distanceStr) : null,
        })),
      })),
    };
    startTransition(async () => {
      const r = await saveSessionEdits(built);
      if (!r.ok) {
        setError(r.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <FieldLabel>Titel</FieldLabel>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel>Trainingstyp</FieldLabel>
          <select
            className={FIELD}
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value as TrainingPlanSessionType)}
          >
            {trainingPlanSessionTypes.map((t) => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Status</FieldLabel>
          <select
            className={FIELD}
            value={status}
            onChange={(e) => setStatus(e.target.value as TrainingPlanSessionStatus)}
          >
            {trainingPlanSessionStatuses.map((s) => (
              <option key={s} value={s}>
                {SESSION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <FieldLabel>Intervalle</FieldLabel>
          <span className="text-xs text-muted-foreground">
            Σ {formatSecondsAsHms(totals.durationSec)}
            {totals.distanceMeters > 0 ? ` · ${formatDistance(totals.distanceMeters)}` : ""}
          </span>
        </div>

        {blocks.map((block, bi) => (
          <BlockEditor
            key={bi}
            index={bi}
            block={block}
            paceZones={paceZones}
            onChange={(next) => patchBlock(bi, next)}
            onRemove={blocks.length > 1 ? () => removeBlock(bi) : undefined}
          />
        ))}

        <button
          type="button"
          onClick={addBlock}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-foreground/20 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Block hinzufügen
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Abbrechen
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Speichere…" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}

// ---- Block-Editor ----

function BlockEditor({
  index,
  block,
  paceZones,
  onChange,
  onRemove,
}: {
  index: number;
  block: BlockState;
  paceZones: PaceZones | null;
  onChange: (next: BlockState) => void;
  onRemove?: () => void;
}) {
  function patchSeg(si: number, next: SegState) {
    onChange({ ...block, segments: block.segments.map((s, i) => (i === si ? next : s)) });
  }
  function removeSeg(si: number) {
    onChange({ ...block, segments: block.segments.filter((_, i) => i !== si) });
  }
  function addSeg() {
    onChange({
      ...block,
      segments: [
        ...block.segments,
        { kind: "recovery", measure: "duration", durationStr: "1:00", distanceStr: "", zone: 1 },
      ],
    });
  }

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Block {index + 1}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Input
              type="number"
              min={1}
              value={block.repetitions}
              onChange={(e) =>
                onChange({ ...block, repetitions: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-7 w-14 text-center"
            />
            ×&nbsp;Wdh.
          </label>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Block entfernen"
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {block.segments.map((seg, si) => (
          <SegmentEditor
            key={si}
            seg={seg}
            paceZones={paceZones}
            onChange={(next) => patchSeg(si, next)}
            onRemove={block.segments.length > 1 ? () => removeSeg(si) : undefined}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addSeg}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="size-3" />
        Segment
      </button>

      <Input
        value={block.description}
        onChange={(e) => onChange({ ...block, description: e.target.value })}
        placeholder="Beschreibung (optional)"
        className="mt-2 h-7 text-xs"
      />
    </div>
  );
}

// ---- Segment-Editor ----

function SegmentEditor({
  seg,
  paceZones,
  onChange,
  onRemove,
}: {
  seg: SegState;
  paceZones: PaceZones | null;
  onChange: (next: SegState) => void;
  onRemove?: () => void;
}) {
  const pace = paceRangeForZone({ zone: seg.zone }, paceZones);
  const paceHint = pace
    ? Math.round(pace.minSec) === Math.round(pace.maxSec)
      ? formatPace(pace.minSec, { withUnit: true })
      : `${formatPace(pace.minSec)}–${formatPace(pace.maxSec, { withUnit: true })}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-card p-1.5 ring-1 ring-black/5">
      <select
        className={cn(FIELD, "h-7 w-[8.5rem] flex-none")}
        value={seg.kind}
        onChange={(e) => onChange({ ...seg, kind: e.target.value as TrainingPlanBlockSegmentKind })}
      >
        {(["warmup", "work", "recovery", "cooldown"] as const).map((k) => (
          <option key={k} value={k}>
            {SEGMENT_KIND_LABELS[k]}
          </option>
        ))}
      </select>

      <div className="flex flex-none overflow-hidden rounded-lg ring-1 ring-input">
        <MeasureToggle
          active={seg.measure === "duration"}
          onClick={() => onChange({ ...seg, measure: "duration" })}
        >
          Dauer
        </MeasureToggle>
        <MeasureToggle
          active={seg.measure === "distance"}
          onClick={() => onChange({ ...seg, measure: "distance" })}
        >
          Distanz
        </MeasureToggle>
      </div>

      {seg.measure === "duration" ? (
        <Input
          value={seg.durationStr}
          onChange={(e) => onChange({ ...seg, durationStr: e.target.value })}
          placeholder="m:ss"
          className="h-7 w-[4.5rem] text-center"
        />
      ) : (
        <label className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={seg.distanceStr}
            onChange={(e) => onChange({ ...seg, distanceStr: e.target.value })}
            className="h-7 w-[4.5rem] text-center"
          />
          <span className="text-xs text-muted-foreground">m</span>
        </label>
      )}

      <select
        className={cn(FIELD, "h-7 w-16 flex-none")}
        value={seg.zone}
        onChange={(e) => onChange({ ...seg, zone: Number(e.target.value) })}
      >
        {[1, 2, 3, 4, 5].map((z) => (
          <option key={z} value={z}>
            Z{z}
          </option>
        ))}
      </select>

      {paceHint && (
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{paceHint}</span>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Segment entfernen"
          className="inline-flex size-6 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}

function MeasureToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

// ---- Daten-Helfer ----

function toBlockState(b: SessionDetail["blocks"][number]): BlockState {
  return {
    repetitions: b.repetitions,
    description: b.description ?? "",
    segments: (b.segmentsJson ?? []).map((s) => {
      const measure: Measure = s.distanceMeters != null ? "distance" : "duration";
      return {
        kind: s.kind,
        measure,
        durationStr: s.durationSec != null ? secToMmss(s.durationSec) : "",
        distanceStr: s.distanceMeters != null ? String(Math.round(s.distanceMeters)) : "",
        zone: s.zone ?? s.zoneMin ?? 1,
      };
    }),
  };
}

function computeTotals(blocks: BlockState[]): { durationSec: number; distanceMeters: number } {
  let durationSec = 0;
  let distanceMeters = 0;
  for (const b of blocks) {
    let bd = 0;
    let bdist = 0;
    for (const s of b.segments) {
      if (s.measure === "duration") bd += parseDuration(s.durationStr) ?? 0;
      else bdist += parseDistance(s.distanceStr) ?? 0;
    }
    durationSec += bd * b.repetitions;
    distanceMeters += bdist * b.repetitions;
  }
  return { durationSec, distanceMeters };
}

function secToMmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// "m:ss" → Sekunden; eine reine Zahl wird als Minuten interpretiert.
function parseDuration(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  if (!t.includes(":")) {
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
  }
  const [mm, ss] = t.split(":");
  const m = Number(mm);
  const s = Number(ss);
  if (!Number.isFinite(m) || !Number.isFinite(s) || s < 0 || s >= 60) return null;
  const total = m * 60 + s;
  return total > 0 ? total : null;
}

function parseDistance(str: string): number | null {
  const n = Number(str.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
