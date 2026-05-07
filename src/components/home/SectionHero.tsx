"use client";

import Link from "next/link";
import { useState } from "react";

type Section = {
  id: string;
  label: string;
  href: string;
  hint: string;
  // Optionaler Pfad zu einem Hintergrundbild in /public.
  // Fehlt das Bild, fällt die Section auf einen CSS-Verlauf zurück.
  image?: string;
  // Verlauf-Farben für den Fallback / Overlay über dem Bild.
  gradientFrom: string;
  gradientTo: string;
  available: boolean;
};

const sections: Section[] = [
  {
    id: "endurance",
    label: "Endurance",
    href: "/endurance",
    hint: "Lauf, Puls, VO₂",
    image: "/heroes/endurance.jpg",
    gradientFrom: "#0b3d2e",
    gradientTo: "#16a34a",
    available: false,
  },
  {
    id: "hypertrophy",
    label: "Hypertrophy",
    href: "/hypertrophy",
    hint: "Kraft, Volumen, Splits",
    image: "/heroes/hypertrophy.jpg",
    gradientFrom: "#3b0f0f",
    gradientTo: "#dc2626",
    available: false,
  },
  {
    id: "weight",
    label: "Weight",
    href: "/weight",
    hint: "Trend, Schwankung, Ziel",
    image: "/heroes/weight.jpg",
    gradientFrom: "#1d1d1f",
    gradientTo: "#f59e0b",
    available: true,
  },
];

export function SectionHeroes() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="grid h-full w-full grid-cols-1 md:grid-cols-3">
      {sections.map((section) => (
        <SectionTile
          key={section.id}
          section={section}
          active={active}
          onActivate={() => setActive(section.id)}
          onDeactivate={() => setActive(null)}
        />
      ))}
    </div>
  );
}

function SectionTile({
  section,
  active,
  onActivate,
  onDeactivate,
}: {
  section: Section;
  active: string | null;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const isActive = active === section.id;
  const isDimmed = active !== null && !isActive;

  const content = (
    <div
      className="relative flex h-full min-h-[40vh] w-full overflow-hidden md:min-h-[100vh]"
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out"
        style={{
          backgroundImage: section.image
            ? `linear-gradient(180deg, ${section.gradientFrom}88 0%, ${section.gradientTo}88 100%), url(${section.image})`
            : `linear-gradient(160deg, ${section.gradientFrom} 0%, ${section.gradientTo} 100%)`,
          transform: isActive ? "scale(1.04)" : "scale(1)",
          filter: isDimmed ? "brightness(0.55)" : "brightness(1)",
        }}
      />
      <div
        className="absolute inset-0 bg-black/0 transition-colors duration-500"
        style={{ backgroundColor: isActive ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0.2)" }}
      />

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-8 text-white md:p-10">
        <div className="flex items-center justify-between text-[11px] tracking-[0.2em] uppercase opacity-80">
          <span>{section.id === "weight" ? "01" : section.id === "hypertrophy" ? "02" : "03"}</span>
          <span>{section.available ? "Live" : "Coming Soon"}</span>
        </div>

        <div>
          <h2
            className="font-heading text-5xl font-medium leading-none tracking-tight transition-all duration-500 md:text-7xl"
            style={{
              letterSpacing: isActive ? "0.04em" : "-0.02em",
            }}
          >
            {section.label}
          </h2>
          <p className="mt-4 max-w-xs text-sm opacity-90 md:text-base">{section.hint}</p>
        </div>
      </div>
    </div>
  );

  if (!section.available) {
    return (
      <div className="cursor-not-allowed select-none" aria-disabled>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={section.href}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {content}
    </Link>
  );
}
