// =============================================================
// Single Source of Truth für Texte und Konfiguration der App.
// HIER ÄNDERST DU MANUELL: App-Name, Modul-Beschreibungen, Status,
// Promo-Banner, Footer.
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
  promo: null as { text: string; href: Route } | null,
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
  // Längere Beschreibung (Coming-Soon).
  description: string;
  // Verlauf-Farben für Tinted-Cards.
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
      "Lauf-Volumen, Kalender und Garmin-Performance (RHR, HRV, Sleep, Race-Predictions).",
    gradientFrom: "#0b3d2e",
    gradientTo: "#16a34a",
    available: true,
  },
];

// =============================================================
// Footer-Konfiguration.
// =============================================================

export const footerLinks: { label: string; href: Route }[] = [
  { label: "Übersicht", href: "/" },
  { label: "Weight", href: "/weight" },
  { label: "Hypertrophy", href: "/hypertrophy" },
  { label: "Endurance", href: "/endurance" },
];
