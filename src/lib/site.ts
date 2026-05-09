// =============================================================
// Single Source of Truth für Texte und Konfiguration der App.
// HIER ÄNDERST DU MANUELL: App-Name, Modul-Beschreibungen, Status,
// Promo-Banner, Hero-Bilder, Footer.
//
// Pages und Komponenten ziehen ihre Texte aus diesem Modul.
// =============================================================

import type { Route } from "next";

export const siteConfig = {
  name: "HealthOS",
  tagline: "Modulares Health & Performance Dashboard",
  // Browser-Tab-Titel und Meta-Description (siehe app/layout.tsx).
  metaTitle: "HealthOS",
  metaDescription: "Modulares Health & Performance Dashboard.",
  // Optionaler Promo-Banner ganz oben auf der Home-Page.
  // Auf null setzen, um zu verstecken.
  promo: {
    text: "Phase 2 ist live — Hypertrophie-Logger",
    href: "/hypertrophy" as Route,
  } as { text: string; href: Route } | null,
} as const;

// =============================================================
// Module = die drei Säulen der App. Reihenfolge bestimmt Display
// in Nav, Heroes und Pulse-Section.
// =============================================================

export type ModuleSlug = "weight" | "hypertrophy" | "endurance";

export type ModuleConfig = {
  slug: ModuleSlug;
  label: string;
  href: Route;
  // Kurzer Untertitel (Hero, Nav-Hover).
  hint: string;
  // Längere Beschreibung (Pulse-Card, Coming-Soon).
  description: string;
  // Bild in /public/heroes — falls keins da, fällt der Hero auf den Verlauf zurück.
  image?: string;
  // Verlauf-Farben für Tinted-Cards / Hero-Overlays.
  gradientFrom: string;
  gradientTo: string;
  // Live ⇒ klickbar in Heroes; Coming Soon ⇒ leicht ausgegraut.
  available: boolean;
};

export const modules: ModuleConfig[] = [
  {
    slug: "weight",
    label: "Weight",
    href: "/weight",
    hint: "Trend, Schwankung, Ziel",
    description:
      "Tägliche Gewichts­messungen mit Glättung, Phasen­erkennung und Cheat-/Alkohol-Tags.",
    image: "/heroes/weight.jpg",
    gradientFrom: "#1d1d1f",
    gradientTo: "#f59e0b",
    available: true,
  },
  {
    slug: "hypertrophy",
    label: "Hypertrophy",
    href: "/hypertrophy",
    hint: "Kraft, Volumen, Splits",
    description:
      "Logbuch für Upper A, Lower und Upper B mit e1RM-Charts und Garmin-Sync.",
    image: "/heroes/hypertrophy.jpg",
    gradientFrom: "#3b0f0f",
    gradientTo: "#dc2626",
    available: true,
  },
  {
    slug: "endurance",
    label: "Endurance",
    href: "/endurance",
    hint: "Herzfrequenz, LT2, VO₂",
    description:
      "Lauf- und Cardio-Daten aus Garmin Connect — kommt im nächsten Schritt.",
    image: "/heroes/endurance.jpg",
    gradientFrom: "#0b3d2e",
    gradientTo: "#16a34a",
    available: false,
  },
];

export const modulesBySlug = new Map<ModuleSlug, ModuleConfig>(
  modules.map((m) => [m.slug, m]),
);

// =============================================================
// Footer-Konfiguration.
// =============================================================

export const footerLinks: { label: string; href: Route }[] = [
  { label: "Übersicht", href: "/" },
  { label: "Weight", href: "/weight" },
  { label: "Hypertrophy", href: "/hypertrophy" },
  { label: "Endurance", href: "/endurance" },
];
