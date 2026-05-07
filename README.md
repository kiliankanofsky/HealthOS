# HealthOS

Modulares Health & Performance Dashboard. Drei Sektionen — **Endurance**, **Hypertrophy**, **Weight**. Phase 1: das Gewichts-Modul ist live, die anderen sind Platzhalter.

## Tech Stack

- **Next.js 16** (App Router) + TypeScript (strict)
- **TailwindCSS v4** + shadcn/ui
- **Drizzle ORM** + **better-sqlite3** (lokale DB unter `data/health.db`)
- **Recharts** für Diagramme
- **SF Pro** (System) als Default-Font, Apple HIG inspirierte Tokens

## Setup

```bash
npm install
cp .env.example .env.local
# SHEETS_CSV_URL und SHEETS_START_YEAR in .env.local eintragen

npm run db:migrate          # SQLite anlegen, Migrations anwenden
npm run db:sync:sheets      # Daten aus Google Sheets ziehen
npm run dev                 # http://localhost:3000
```

Wenn du noch kein Sheet hast und mit Mock-Daten starten willst:

```bash
npm run db:seed             # ~60 Tage realistische Mock-Daten
```

## Routen

- `/` — Open-style Homescreen mit drei Sektionen
- `/weight` — Gewichts-Modul (Chart, Stats, Eingabeform, Tabelle)
- `/endurance`, `/hypertrophy` — Platzhalter ("Bald verfügbar")

## Verfügbare Scripts

| Script | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server (Turbopack) |
| `npm run build` | Production-Build |
| `npm run start` | Production-Server |
| `npm run lint` | ESLint |
| `npm run db:generate` | Neue Drizzle-Migration aus Schema generieren |
| `npm run db:migrate` | Pending-Migrations anwenden |
| `npm run db:seed` | DB leeren und mit 60 Tagen Mock-Daten füllen |
| `npm run db:sync:sheets` | Gewichts-Daten aus Google Sheet upserten |
| `npm run db:studio` | Drizzle Studio (lokales DB-UI) |

## Google Sheets — Daten-Sync

**Anforderung:** Sheet ist mit "anyone with the link can view" geteilt (oder Publish-to-Web).

**Erwartetes Sheet-Layout** (Spalten):

| KW | Woche Phase | … | KCal | Mo | Di | Mi | Do | Fr | Sa | So | … |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 46 |  |  | 3300 |  |  |  | 59 | 59,6 | 59,6 |  |  |

- Eine Zeile pro ISO-Kalenderwoche.
- `KW` = Spalte 1.
- Tagesgewichte in Spalten 5–11 (Mo bis So), deutsches Komma-Dezimalformat (`60,2`).
- Leere Zellen = keine Messung.

**Jahresermittlung:** Da das Sheet keine Jahres-Spalte hat, trackt der Adapter das Jahr durch KW-Resets — sobald die KW von Zeile zu Zeile zurückspringt (z. B. 52 → 1), wird das Jahr inkrementiert. Das **Startjahr** der ersten Zeile setzt du in `SHEETS_START_YEAR` (z. B. `2023`, falls die erste Zeile KW 46 von 2023 enthält).

**ENV-Vars** (`.env.local`):

```
SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/<ID>/export?format=csv
SHEETS_START_YEAR=2023
```

## Projektstruktur

```
src/
  app/
    page.tsx                       Open-style Homescreen
    layout.tsx
    weight/
      page.tsx                     Gewichts-Modul
      actions.ts                   Server Actions (Add / Delete)
    endurance/page.tsx             Platzhalter
    hypertrophy/page.tsx           Platzhalter
  components/
    home/
      SectionHero.tsx              Drei Section-Tiles im Open-Look (Client)
      Topbar.tsx                   Live-Uhrzeit-Header (Client)
    weight/
      WeightChart.tsx              Recharts (Client)
      WeightStats.tsx              Stat-Cards (Server)
      WeightEntryForm.tsx          Eingabeform (Client)
      WeightTable.tsx              Letzte Einträge (Server)
    ui/                            shadcn/ui Komponenten
    ComingSoon.tsx
  lib/
    db/
      schema.ts                    Drizzle-Tabellen
      index.ts                     DB-Client
      queries.ts                   CRUD
      migrate.ts                   Migrations-Runner
    integrations/
      types.ts                     Adapter-Interface
      sheets.ts                    Google-Sheets-Adapter (CSV)
      garmin.ts                    Stub
      fddb.ts                      Stub
    utils/
      weight-stats.ts
      date.ts                      Lokales ISO-Date (kein UTC-Shift)
      iso-week.ts                  ISO-Wochen-Helper
      csv.ts                       Mini-CSV-Parser
drizzle/                           Generierte SQL-Migrations
scripts/
  seed.ts                          Mock-Daten-Generator
  sync-sheets.ts                   Sheets → DB
data/
  health.db                        Lokale SQLite-Datei (gitignored)
public/heroes/                     Hero-Bilder für Homescreen-Sektionen
```

## Datenmodell

Tabelle `weight_entries`:

| Spalte | Typ | Notizen |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `date` | TEXT (YYYY-MM-DD) | UNIQUE — ein Eintrag pro Tag |
| `weight_kg` | REAL NOT NULL | |
| `source` | TEXT | `manual` \| `sheets` \| `garmin` |
| `notes` | TEXT NULL | |
| `created_at` | TEXT DEFAULT now() | |

## Hero-Bilder ersetzen

Lege drei Dateien in `public/heroes/` ab — der Code referenziert sie unter exakt diesen Namen:

```
public/heroes/endurance.jpg
public/heroes/hypertrophy.jpg
public/heroes/weight.jpg
```

Fehlt ein Bild, fällt die jeweilige Section auf einen CSS-Verlauf zurück.

## Architektur-Prinzipien

- **Adapter-Pattern für externe Quellen.** `src/lib/integrations/` definiert ein gemeinsames Interface (`WeightSourceAdapter`). Sheets ist live, Garmin und FDDB sind Stubs.
- **DB als Single Source of Truth.** Adapter normalisieren ins DB-Schema und upserten. UI liest nur aus der DB.
- **DB-Agnostik.** Migration zu Postgres (z. B. Supabase) ist primär eine Config-Änderung in `drizzle.config.ts` und der DB-Init in `src/lib/db/index.ts`.
- **Server Components by default.** Nur Chart, Form, Topbar und Section-Heroes sind Client Components (Interaktivität / Recharts).
- **Server Actions** für Form-Submissions (Add, Delete) — kein API-Layer nötig.

## Nächste Schritte

- Hero-Bilder einsetzen (Querformat 16:9 oder breiter).
- Endurance-Adapter (Garmin Connect, OAuth).
- Hypertrophy-Logger (eigene UI + DB-Tabelle).
- Migration zu Postgres / Supabase, sobald Cloud-Deploy ansteht.
