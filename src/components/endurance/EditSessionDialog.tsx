"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  deletePlanSessionAction,
  saveSessionEdits,
  type SaveSessionEditsInput,
  type SessionDetail,
} from "@/app/endurance/recommendations/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SplitsChart } from "@/components/endurance/SplitsChart";
import {
  trainingPlanSessionStatuses,
  trainingPlanSessionTypes,
  type TrainingPlanBlockSegmentKind,
  type TrainingPlanSessionStatus,
  type TrainingPlanSessionType,
} from "@/lib/db/schema";
import { formatSecondsAsHms, type PaceZones } from "@/lib/endurance/plan";
import {
  formatDistance,
  SEGMENT_KIND_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
  sessionTone,
} from "@/lib/endurance/plan-format";
import { buildSplits, sessionTotals, type SplitsBlock } from "@/lib/endurance/plan-splits";
import { cn } from "@/lib/utils";

type Measure = "duration" | "distance";

type SegState = {
  kind: TrainingPlanBlockSegmentKind;
  measure: Measure;
  durationStr: string;
  distanceStr: string;
  zone: number;
};

type BlockState = {
  repetitions: number;
  description: string;
  segments: SegState[];
};

type Props = {
  editingId: number | null;
  detail: SessionDetail | null;
  loading: boolean;
  paceZones: PaceZones | null;
  onClose: () => void;
  onSaved: () => void;
};

const FIELD =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
// Inline-editierbar: sieht aus wie Text, wird beim Fokus grau hinterlegt,
// kein Dropdown-Pfeil (appearance-none).
const INLINE_SELECT =
  "cursor-pointer appearance-none rounded-md bg-transparent px-1.5 py-0.5 outline-none transition-colors hover:bg-foreground/5 focus:bg-foreground/10";

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
        <Dialog.Popup className="w-[min(900px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-7">
          <Dialog.CloseIconButton />
          {/* Bewusst keine Header-Überschrift/Beschreibung — der editierbare
              Titel ist der Hero. */}
          {ready ? (
            <SessionEditForm
              key={detail.session.id}
              detail={detail}
              paceZones={paceZones}
              onCancel={onClose}
              onSaved={onSaved}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lade Session…
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const splitBlocks = useMemo(() => blocksToSplitBlocks(blocks), [blocks]);
  const totals = useMemo(
    () => sessionTotals(splitBlocks, paceZones),
    [splitBlocks, paceZones],
  );
  const dominantZone = useMemo(() => dominantZoneOf(blocks), [blocks]);
  const splits = useMemo(
    () => buildSplits(splitBlocks, paceZones),
    [splitBlocks, paceZones],
  );
  const tone = sessionTone(sessionType);

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

  function handleDelete() {
    startTransition(async () => {
      const r = await deletePlanSessionAction(detail.session.id);
      if (!r.ok) {
        setError(r.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Editierbarer Titel (Hero) ── */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Titel"
        className="-mx-1.5 w-full rounded-lg bg-transparent px-1.5 py-0.5 font-heading text-3xl font-semibold tracking-tight outline-none transition-colors hover:bg-foreground/5 focus:bg-foreground/10 lg:text-4xl"
      />

      {/* ── Hero-Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <HeroStat
          label="Distanz"
          value={totals.distanceMeters > 0 ? formatDistance(totals.distanceMeters) : "—"}
        />
        <HeroStat label="Zone" value={dominantZone ? `Z${dominantZone}` : "—"} />
        <HeroStat label="Dauer" value={formatSecondsAsHms(totals.durationSec)} />
      </div>

      {/* ── Splits links · Edit-Card rechts ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          {/* Bei Recovery/Easy keine rote "schnellster km"-Hervorhebung. */}
          <SplitsChart
            result={splits}
            highlightFastest={sessionType !== "recovery" && sessionType !== "easy"}
          />
        </div>

        <div className="space-y-4 rounded-2xl bg-muted/60 p-4 ring-1 ring-black/5">
          {/* Typ + Status inline editierbar (kein Label, kein Dropdown-Pfeil) */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("rounded-full px-1 text-xs font-medium", tone.soft)}>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as TrainingPlanSessionType)}
                className={cn(INLINE_SELECT, "font-medium")}
                aria-label="Trainingstyp"
              >
                {trainingPlanSessionTypes.map((t) => (
                  <option key={t} value={t}>
                    {SESSION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TrainingPlanSessionStatus)}
              className={cn(INLINE_SELECT, "text-muted-foreground")}
              aria-label="Status"
            >
              {trainingPlanSessionStatuses.map((s) => (
                <option key={s} value={s}>
                  {SESSION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {/* Intervalle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Intervalle
              </span>
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
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Wirklich löschen?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              Ja, löschen
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-red-600"
          >
            <Trash2 className="size-4" />
            Löschen
          </button>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-heading text-2xl font-semibold tabular-nums lg:text-3xl">
        {value}
      </p>
    </div>
  );
}

// ---- Block-Editor (unverändert in der Logik, nur ohne paceZones-Hint hier) ----

function BlockEditor({
  index,
  block,
  onChange,
  onRemove,
}: {
  index: number;
  block: BlockState;
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
    <div className="rounded-xl bg-card p-3 ring-1 ring-black/5">
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

function SegmentEditor({
  seg,
  onChange,
  onRemove,
}: {
  seg: SegState;
  onChange: (next: SegState) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 p-1.5">
      <select
        className={cn(FIELD, "h-7 w-[7.5rem] flex-none")}
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
        className={cn(FIELD, "h-7 w-14 flex-none")}
        value={seg.zone}
        onChange={(e) => onChange({ ...seg, zone: Number(e.target.value) })}
      >
        {[1, 2, 3, 4, 5].map((z) => (
          <option key={z} value={z}>
            Z{z}
          </option>
        ))}
      </select>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Segment entfernen"
          className="ml-auto inline-flex size-6 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
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

// Editier-State → Segment-Struktur für Totals/Splits (live).
function blocksToSplitBlocks(blocks: BlockState[]): SplitsBlock[] {
  return blocks.map((b) => ({
    repetitions: b.repetitions,
    segmentsJson: b.segments.map((s) => ({
      kind: s.kind,
      zone: s.zone,
      ...(s.measure === "duration"
        ? { durationSec: parseDuration(s.durationStr) ?? 0 }
        : { distanceMeters: parseDistance(s.distanceStr) ?? 0 }),
    })),
  }));
}

function dominantZoneOf(blocks: BlockState[]): number | null {
  let workMax: number | null = null;
  let anyMax: number | null = null;
  for (const b of blocks) {
    for (const s of b.segments) {
      anyMax = anyMax == null ? s.zone : Math.max(anyMax, s.zone);
      if (s.kind === "work") workMax = workMax == null ? s.zone : Math.max(workMax, s.zone);
    }
  }
  return workMax ?? anyMax;
}

function secToMmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
