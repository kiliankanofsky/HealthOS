"use client";

import { useId } from "react";

import type { AvatarRegion, HighlightLevel } from "@/lib/hypertrophy/muscles";
import { cn } from "@/lib/utils";

import {
  ANATOMY_VIEWBOX_ANTERIOR,
  ANATOMY_VIEWBOX_POSTERIOR,
  ANTERIOR_PATHS,
  POSTERIOR_PATHS,
  type RegionPaths,
} from "./anatomy-paths";

export type MuscleAvatarProps = {
  view: "anterior" | "posterior";
  /** Map<AvatarRegion, "primary" | "secondary"> — was leuchten soll. */
  highlights?: Map<AvatarRegion, HighlightLevel>;
  /** Aktiv hervorgehobene Region (Hover/Tap aus dem Parent). */
  activeRegion?: AvatarRegion | null;
  onRegionEnter?: (region: AvatarRegion) => void;
  onRegionLeave?: (region: AvatarRegion) => void;
  onRegionClick?: (region: AvatarRegion) => void;
  /** Wenn `false`, sind die Polygone nicht interaktiv (z.B. rein dekorativ). */
  interactive?: boolean;
  className?: string;
  /**
   * Stil-Variante:
   *   - "neutral": dunkelgrau für Active/Primary (Workout-Pages)
   *   - "tinted":  Indigo-Tint für Active (z.B. eigene Akzentfarbe)
   *   - "subtle":  hellgrau für Active (Overview-Page, kein Default-Highlight)
   */
  tone?: "neutral" | "tinted" | "subtle";
};

export function MuscleAvatar({
  view,
  highlights,
  activeRegion = null,
  onRegionEnter,
  onRegionLeave,
  onRegionClick,
  interactive = true,
  className,
  tone = "neutral",
}: MuscleAvatarProps) {
  const paths = view === "anterior" ? ANTERIOR_PATHS : POSTERIOR_PATHS;
  const viewBox =
    view === "anterior" ? ANATOMY_VIEWBOX_ANTERIOR : ANATOMY_VIEWBOX_POSTERIOR;

  // Unique IDs pro Avatar-Instanz, damit zwei Avatars nebeneinander nicht
  // dieselben gradient/filter-IDs teilen.
  const uid = useId().replace(/[:]/g, "");
  const gradPrimary = `${uid}-primary`;
  const gradSecondary = `${uid}-secondary`;
  const gradActive = `${uid}-active`;
  const filterGlass = `${uid}-glass`;

  // Farbpalette: clean, Apple-HIG, dezenter Tint je nach Tone.
  const palette =
    tone === "tinted"
      ? {
          primaryTop: "#475569",
          primaryBot: "#1e293b",
          secondaryTop: "#cbd5e1",
          secondaryBot: "#94a3b8",
          activeTop: "#312e81",
          activeBot: "#1e1b4b",
        }
      : tone === "subtle"
        ? {
            primaryTop: "#475569",
            primaryBot: "#1e293b",
            secondaryTop: "#cbd5e1",
            secondaryBot: "#94a3b8",
            // Hellgrau für Active — Overview-Hover ohne Default-Highlight.
            activeTop: "#cbd5e1",
            activeBot: "#94a3b8",
          }
        : {
            primaryTop: "#475569",
            primaryBot: "#1e293b",
            secondaryTop: "#cbd5e1",
            secondaryBot: "#94a3b8",
            activeTop: "#0f172a",
            activeBot: "#020617",
          };

  return (
    <svg
      viewBox={viewBox}
      className={cn(
        "h-full w-full select-none [shape-rendering:geometricPrecision]",
        className,
      )}
      aria-label={view === "anterior" ? "Vorderansicht" : "Rückansicht"}
      role="img"
    >
      <defs>
        {/* Linear-Gradients als Glas-Andeutung: Lichtkante oben, Schatten unten. */}
        <linearGradient id={gradPrimary} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.primaryTop} stopOpacity="0.96" />
          <stop offset="100%" stopColor={palette.primaryBot} stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={gradSecondary} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.secondaryTop} stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.secondaryBot} stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={gradActive} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.activeTop} stopOpacity="0.98" />
          <stop offset="100%" stopColor={palette.activeBot} stopOpacity="0.95" />
        </linearGradient>
        {/* Subtiler "Glas"-Drop-Shadow für hervorgehobene Patches. */}
        <filter id={filterGlass} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.4" />
          <feOffset dy="0.3" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.35" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {paths.map((path, idx) => (
        <RegionPolygon
          key={idx}
          path={path}
          highlight={
            path.region ? (highlights?.get(path.region) ?? null) : null
          }
          isActive={path.region != null && path.region === activeRegion}
          interactive={interactive && path.region !== null}
          ids={{ gradPrimary, gradSecondary, gradActive, filterGlass }}
          onEnter={
            path.region && onRegionEnter
              ? () => onRegionEnter(path.region!)
              : undefined
          }
          onLeave={
            path.region && onRegionLeave
              ? () => onRegionLeave(path.region!)
              : undefined
          }
          onClick={
            path.region && onRegionClick
              ? () => onRegionClick(path.region!)
              : undefined
          }
        />
      ))}
    </svg>
  );
}

function RegionPolygon({
  path,
  highlight,
  isActive,
  interactive,
  ids,
  onEnter,
  onLeave,
  onClick,
}: {
  path: RegionPaths;
  highlight: HighlightLevel | null;
  isActive: boolean;
  interactive: boolean;
  ids: {
    gradPrimary: string;
    gradSecondary: string;
    gradActive: string;
    filterGlass: string;
  };
  onEnter?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
}) {
  // Fill-Strategie: aktiver Hover/Tap übersteuert die Default-Highlight-Stufe.
  let fill: string;
  let useFilter = false;
  if (isActive) {
    fill = `url(#${ids.gradActive})`;
    useFilter = true;
  } else if (highlight === "primary") {
    fill = `url(#${ids.gradPrimary})`;
    useFilter = true;
  } else if (highlight === "secondary") {
    fill = `url(#${ids.gradSecondary})`;
  } else {
    // Default-Body: fast weiß mit hauchzartem Tint.
    fill = "#f8fafc";
  }

  return (
    <g
      data-region={path.region ?? "decorative"}
      data-highlight={highlight ?? "none"}
      data-active={isActive ? "true" : undefined}
      className={cn(
        "transition-[opacity,filter] duration-200 ease-out",
        interactive && "cursor-pointer",
      )}
      onPointerEnter={
        interactive && onEnter
          ? (e) => {
              if (e.pointerType === "mouse") onEnter();
            }
          : undefined
      }
      onPointerLeave={
        interactive && onLeave
          ? (e) => {
              if (e.pointerType === "mouse") onLeave();
            }
          : undefined
      }
      onClick={interactive ? onClick : undefined}
    >
      {path.points.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill={fill}
          filter={useFilter ? `url(#${ids.filterGlass})` : undefined}
          stroke={highlight || isActive ? "rgba(255,255,255,0.55)" : "#e2e8f0"}
          strokeWidth={highlight || isActive ? 0.35 : 0.3}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
