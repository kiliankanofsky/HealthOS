"use client";

import Link from "next/link";
import { useState } from "react";

import { type ModuleConfig, modules } from "@/lib/site";
import { cn } from "@/lib/utils";

// Drei full-bleed Hero-Tiles, side-by-side auf Desktop, gestapelt mobile.
// Inspiration: Apple-Marketing × Adidas-Editorial. Bei Hover dimmt sich das
// Tile selbst leicht ab und das Bild zoomt zart — die anderen Tiles dimmen.
export function HeroGrid() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <section className="grid grid-cols-1 md:grid-cols-3" aria-label="Module">
      {modules.map((m, idx) => (
        <HeroTile
          key={m.slug}
          module={m}
          index={idx}
          active={active}
          onActivate={() => setActive(m.slug)}
          onDeactivate={() => setActive(null)}
        />
      ))}
    </section>
  );
}

function HeroTile({
  module: m,
  index,
  active,
  onActivate,
  onDeactivate,
}: {
  module: ModuleConfig;
  index: number;
  active: string | null;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const isActive = active === m.slug;
  const isDimmed = active !== null && !isActive;

  const inner = (
    <div
      className={cn(
        "relative isolate flex h-[55vh] w-full overflow-hidden md:h-[78vh] md:min-h-[640px]",
        "transition-[filter] duration-500",
        isDimmed && "brightness-[0.55]",
      )}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    >
      {/* Hintergrund-Bild + Verlauf-Overlay. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10 bg-cover bg-center transition-transform duration-700 ease-out",
          isActive ? "scale-[1.04]" : "scale-100",
        )}
        style={{
          backgroundImage: m.image
            ? `linear-gradient(180deg, ${m.gradientFrom}77 0%, ${m.gradientTo}77 100%), url(${m.image})`
            : `linear-gradient(160deg, ${m.gradientFrom} 0%, ${m.gradientTo} 100%)`,
        }}
      />
      {/* Sehr dezenter zusätzlicher Tint für lesbare Typo. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/35 via-black/0 to-black/15"
      />

      <div className="relative flex h-full w-full flex-col justify-between p-7 text-white sm:p-9 md:p-10">
        {/* Top — Index + Status. */}
        <div className="flex items-start justify-between text-[10px] font-medium tracking-[0.22em] uppercase text-white/85">
          <span className="tabular-nums">
            {String(index + 1).padStart(2, "0")} / {String(modules.length).padStart(2, "0")}
          </span>
          <StatusPill available={m.available} />
        </div>

        {/* Bottom — Titel + Hint + CTA-Hinweis. */}
        <div className="space-y-3">
          <h2
            className={cn(
              "font-heading text-5xl font-semibold leading-[0.95] tracking-tight transition-[letter-spacing,transform] duration-500 sm:text-6xl md:text-[5.5rem] xl:text-[6.5rem]",
              isActive ? "tracking-[0.005em]" : "tracking-[-0.02em]",
            )}
          >
            {m.label}
          </h2>
          <p className="max-w-md text-sm text-white/85 sm:text-base">{m.hint}</p>
          {m.available && (
            <span
              className={cn(
                "inline-flex items-center gap-2 pt-1 text-xs font-medium tracking-[0.18em] uppercase text-white/90 transition-opacity duration-300",
                isActive ? "opacity-100" : "opacity-70",
              )}
            >
              Öffnen
              <span
                aria-hidden
                className={cn(
                  "transition-transform duration-300",
                  isActive ? "translate-x-1.5" : "translate-x-0",
                )}
              >
                →
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!m.available) {
    return (
      <div className="cursor-not-allowed select-none" aria-disabled>
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={m.href}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
    >
      {inner}
    </Link>
  );
}

function StatusPill({ available }: { available: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.16em] uppercase",
        available
          ? "bg-white/15 text-white ring-1 ring-white/30 backdrop-blur"
          : "bg-black/30 text-white/70 ring-1 ring-white/15 backdrop-blur",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          available ? "bg-emerald-400" : "bg-amber-400",
        )}
      />
      {available ? "Live" : "Soon"}
    </span>
  );
}
