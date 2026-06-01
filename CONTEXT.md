# HealthOS — Projekt-Kontext

> **Sinn dieser Datei:** Schneller Einstieg in das Projekt ohne den gesamten Code zu lesen. Hier stehen Architektur, Datei-Index, Funktions-Übersicht und Deployment-Constraints.
> Bei größeren Umbauten diese Datei bitte aktualisieren.

## 1. Was ist HealthOS

Privates Self-Tracking-Tool für einen einzelnen Nutzer (kiliankanofsky). Drei Module:

- **Weight** (Phase 1, live): Gewichtsverlauf aus Google Sheets, Trend, Phasen (cut/bulk/maintenance). Tag-Metadaten (Cheat-Day/Meal, Alkohol, kcal-Ziel) leben seit Migration 0012 in einer eigenen `daily_tags`-Tabelle.
- **Hypertrophy** (Phase 2, live): Krafttrainings-Logger mit Templates (Upper-A / Lower / Upper-B), Sätze pro Übung, Garmin-Sync für Trainingsdaten, Per-Übung-Progress-Chart
- **Endurance** (Phase 3, live seit 2026-05-25): Lauf-Daten aus Garmin (run_sessions), Daily-Metrics-Snapshots (RHR, HRV mit Baseline-Korridor, Sleep mit Stadien, VO₂ Max, Lactate Threshold, Race Predictions, Training Status). Klickbare Metric-Tiles mit Detail-Popovern + 8-Wochen-Trend-Charts.

Zusatz: **Nutrition** (FDDB-Sync, Tageskalorien + Makros), **Daily Activity** (Garmin-Gesamtkalorien) und **Tags** (Cheat/Alkohol-Übersicht unter `/weight/tags`) als Erweiterungen.

## 2. Tech-Stack

| Schicht | Wahl |
|---|---|
| Framework | Next.js **16.2.5** (App Router, Turbopack) — **breaking changes vs. ältere Versionen, immer node_modules/next/dist/docs/ konsultieren bei Neuschrift von Next-Code** (siehe AGENTS.md) |
| UI | React 19, shadcn/ui (Base UI), Tailwind CSS v4 |
| DB-ORM | Drizzle ORM (`drizzle-orm`) |
| DB-Treiber | `@libsql/client` (async) — **NICHT mehr better-sqlite3** |
| DB lokal | SQLite-Datei `data/health.db` (gitignored) |
| DB Production | Turso (libSQL Cloud), Region Frankfurt |
| Hosting | **Vercel** (serverless) |
| Sprache | TypeScript, strict |
| Charts | Recharts |
| Externe Integrationen | Google Sheets (CSV-Export), Garmin Connect (`@gooin/garmin-connect`), FDDB (HTML-Scraping mit Cookie) |

## 3. Hosting / Deployment

### Vercel-Constraints (WICHTIG)

Vercel ist **serverless**. Daraus folgende Regeln im Code:

- **❌ KEIN persistentes Filesystem.** Kein `fs.writeFile` in `data/`, `public/uploads/` o.ä. zur Laufzeit. (`/tmp` ist erlaubt, aber pro Request flüchtig.)
- **❌ KEIN `better-sqlite3` o.ä. native Bindings, die State im Memory halten** wollen. Wir nutzen `@libsql/client` mit remote URL.
- **❌ KEIN langlebiger Prozess** (keine WebSockets, kein Background-Worker, kein in-memory-Cache der über Requests bleibt).
- **❌ KEIN top-level `await` in Modulen, die als CJS gebaut werden** (Build kann brechen). In Skripten in `async main()` wrappen.
- **✅ ENV-Vars** statt File-basierte Configs.
- **✅ Cron Jobs** nur über `vercel.json` (Hobby-Plan: max 2 Crons, je 1x/Tag).
- **✅ Route Handler** (`route.ts`) für API-Endpunkte, `maxDuration` ≤ 60s auf Hobby.
- **TypeScript-Strict-Mode:** Vercels Build-tsc ist strenger als der lokale — alle `process.env.X` müssen vor Nutzung explizit eng gemacht werden (siehe `requireEnv()` in `scripts/migrate-to-turso.ts`).

### Environment Variables (Production)

In Vercel → Settings → Environment Variables gesetzt für Production+Preview+Development:

| Name | Zweck |
|---|---|
| `TURSO_DATABASE_URL` | libSQL-URL deiner Cloud-DB |
| `TURSO_AUTH_TOKEN` | Turso-API-Token |
| `CRON_SECRET` | Bearer-Token, das `/api/cron/sync` erwartet |
| `SHEETS_CSV_URL` | Google-Sheets-CSV-Export-URL für Weight |
| `SHEETS_START_YEAR` | Startjahr der ersten KW im Sheet |
| `GARMIN_USERNAME` | Garmin Connect Login |
| `GARMIN_PASSWORD` | Garmin Connect Login |
| `FDDB_COOKIE` | Cookie für FDDB-Scraping |

Lokal liegen die gleichen Werte in `.env.local` (gitignored). `.env.example` ist die Vorlage ohne Secrets.

### DB-Switching

`src/lib/db/index.ts` entscheidet:
- `process.env.VERCEL === "1"` ODER `process.env.USE_TURSO === "1"` → Turso (remote)
- Sonst → `file:./data/health.db` (lokal)

Heißt: lokales `npm run dev` läuft gegen die lokale SQLite-Datei. Wenn man lokal gegen Turso testen will: `USE_TURSO=1 npm run dev`.

### Cron-Job

`vercel.json` definiert: `0 4 * * *` UTC (= 05:00/06:00 lokal je nach Sommer/Winter) → `GET /api/cron/sync`. Vercel sendet `Authorization: Bearer ${CRON_SECRET}`. Endpoint führt 6 Syncs hintereinander aus (sheets, garmin-strength, garmin-calories, garmin-runs, garmin-metrics, nutrition) und gibt ein Summary-JSON zurück.

## 4. Datei-Index

### 4.1 App-Routen (`src/app/`)

| Pfad | Typ | Zweck |
|---|---|---|
| `layout.tsx` | RSC | Root-Layout, Fonts, globaler `AppShell` |
| `page.tsx` | RSC | Homescreen — Hero-Grid + PulseSection (Live-Stats Weight/Hypertrophy) |
| `weight/page.tsx` | RSC | Weight-Dashboard: Chart, Stats, Phasen, Day-Detail, Buttons (Sync / Tags) |
| `weight/entries/page.tsx` | RSC | Tabelle aller Weight-Einträge |
| `weight/tags/page.tsx` | RSC | Tag-Übersicht (Cheat-Day/Alkohol/Cheat-Meal) mit Editor — auch für Tage ohne Weight-Eintrag |
| `weight/actions.ts` | Server Action | upsert/delete Weight + Phasen + Tags (saveDailyTag / removeDailyTag) |
| `hypertrophy/page.tsx` | RSC | Templates-Übersicht + Kalender + Workout-Cards |
| `hypertrophy/[slug]/page.tsx` | RSC | Template-Detail (alle Sessions) |
| `hypertrophy/[slug]/[date]/page.tsx` | RSC | Session-Detail mit Sets-Logger |
| `hypertrophy/[slug]/exercise/[exerciseSlug]/page.tsx` | RSC | Per-Übung-Progress-Chart |
| `hypertrophy/actions.ts` | Server Action | createSession / upsertSet / updateNotes / overrides |
| `nutrition/page.tsx` | RSC | Nutrition-Chart + Korrelation mit Weight |
| `endurance/page.tsx` | RSC | Endurance-Hauptseite: Kilometergrafik + RunCalendar + MetricsDashboard + TrainingsSection |
| `endurance/[date]/page.tsx` | RSC | Lauf-Detail (Pace, HR, Höhenmeter, Training Effect) |
| `endurance/recommendations/page.tsx` | RSC | Phase 4 Übersicht — EmptyState mit "Plan anlegen"-CTA wenn kein Plan, sonst Plan-Summary-Card + Wochen-Grid (volles 4-Card-Layout folgt in Sprint 4). Nutzt `getCurrentTrainingPlan()` (draft+active). |
| `endurance/recommendations/setup/page.tsx` | RSC | Plan-Setup-Formular: Race-Daten, Volumen, Pace-Zonen (auto/manuell), Drag-and-Drop-PDF-Upload. Submit ruft `createPlanFromSettings` (actions.ts). |
| `endurance/recommendations/actions.ts` | Server Action | `createPlanFromSettings(prev, formData)` — validiert Form, extrahiert PDF-Text, archiviert vorhandenen aktiven Plan, schreibt training_plans + 16 Wochen-Slots, redirected zu /endurance/recommendations. |
| `endurance/history/page.tsx` | RSC | Placeholder: historische Trainings-Liste |
| `endurance/{longevity,performance}/{recommendations,history}/page.tsx` | RSC | Vier Sub-Placeholder (alt — verweist auf die unified Routes oben) |
| `api/cron/sync/route.ts` | Route Handler | **GET** mit Bearer-Auth, führt 6 Syncs aus (sheets/strength/calories/runs/metrics/nutrition) |

### 4.2 Komponenten (`src/components/`)

Nach Modul gruppiert. **RSC** = Server Component, **CC** = Client Component (`"use client"`).

- `site/` — `AppShell` (Wrapper), `SiteHeader`, `SiteFooter`
- `home/` — `HeroGrid`, `PromoBar`, `PulseSection` (RSC, lädt Live-Stats), `SectionHero`, `Topbar`
- `weight/` — `WeightChart`/`Chart Section` (Recharts, CC), `WeightStats`, `WeightTable`, `WeightWeekMatrix`, `WeightDayList`, `WeightDayDetailDialog` (CC, nimmt jetzt `tag`-Prop), `WeightDetailView`, `WeightEntryForm` (CC), `PhaseEditDialog` (CC), `TagEditor` (CC, Tag-Übersicht + Edit-Dialog)
- `hypertrophy/` — `Calendar`, `SessionLogger` (CC), `NewSessionDialog` (CC), `DeleteSessionButton` (CC), `OpenOrCreateSessionButton` (CC), `ExerciseProgressChart` (CC), `WorkoutCards` (RSC), `WorkoutOverviewChart`, `SiblingNavButtons`/`SiblingSwipe`
- `hypertrophy/avatar/` — `MuscleAvatar` (SVG-Bodymap), `OverviewAvatarPanel`, `WorkoutAvatarPanel`, `MuscleExerciseList`, `anatomy-paths.ts` (SVG-Pfade)
- `endurance/` — `KmGraphSection` (CC, Recharts AreaChart wöchentliches Volumen), `RunCalendar` (CC, Adaption des Hypertrophy-Kalenders mit Double-Day-Indikator), `MetricsDashboard` (CC, sieben klickbare Tiles mit Detail-Popovern: RHR, HRV, Sleep, Race-Predictions, Training Status, VO₂, Lactate Threshold), `TrainingsSection` (RSC, zwei Cards für Empfohlen/Historisch), `PlanSetupForm` (CC, Phase 4: Form mit Live-Pace-Berechnung, Pace-Zone-Auto-Ableitung mit Manual-Override, Drag-and-Drop-PDF-Upload), `PerformanceDashboard` (legacy, nicht mehr benutzt — bei Cleanup entfernen)
- `nutrition/` — `NutritionChart` + `ChartSection`, `NutritionCorrelationView` (Streudiagramm Weight×Kalorien), `NutritionDayDetailDialog` (alle drei nehmen jetzt `tags`-Prop)
- `ui/` — shadcn-Primitives: `button`, `card`, `dialog`, `input`, `label`, `popover`, `segmented-control`, `table`
- `ComingSoon.tsx` — Placeholder

### 4.3 DB-Layer (`src/lib/db/`)

| Datei | Inhalt |
|---|---|
| `index.ts` | Drizzle-Client. libSQL, schaltet via ENV zwischen lokaler Datei und Turso |
| `schema.ts` | **Komplettes Schema** — alle Tabellen + Typen (siehe Tabellen-Liste unten) |
| `queries.ts` | **Alle Datenzugriffe** — alle Funktionen async, siehe Funktions-Inventar §5 |
| `migrate.ts` | One-Shot-Migration-Runner. `npm run db:migrate` lokal, oder `USE_TURSO=1` gegen Turso |

**Tabellen** (in `schema.ts`):
- `weight_entries` — **nur noch** Gewicht pro Tag (date, weight_kg, source, notes). Tag-Spalten wurden in Migration 0012 entfernt und in `daily_tags` migriert.
- `weight_phases` — cut/bulk/maintenance-Zeiträume
- `daily_tags` — Cheat-Day / Alkohol / Cheat-Meal / kcal-Ziel / notes pro Datum (UNIQUE auf `date`). Single Source of Truth seit Migration 0012; existiert unabhängig von Weight-Einträgen.
- `exercises` — Stamm-Übungen mit Aliases (für Garmin-Mapping) und Muskelgruppen
- `workout_templates` — Upper-A / Lower / Upper-B
- `workout_template_exercises` — Slots pro Template (Position, Default-Reps)
- `workout_sessions` — eine Trainings-Instanz (Template + Datum) + garminActivityId für Idempotenz
- `workout_sets` — einzelne Sätze pro Session (sessionId, templateExerciseId, setNumber, weight, reps)
- `session_exercise_overrides` — alternative Übung pro Slot pro Session (wenn Gerät besetzt war)
- `nutrition_entries` — Tageskalorien + Makros aus FDDB
- `daily_activity` — Tagesgesamtkalorien aus Garmin (total/aktiv/BMR/Schritte)
- `garmin_tokens` — OAuth1+OAuth2-Tokens (single-row, id=1) — **ersetzt File-Cache**
- `run_sessions` — eine Zeile pro Lauf-Activity aus Garmin (Distanz, Dauer, Pace, HR, Höhenmeter, Training Effect, VO₂). Idempotent via garminActivityId.
- `garmin_daily_metrics` — Tagesschnappschuss (UNIQUE auf `date`): RHR + 7d-Avg, HRV + Baseline-Korridor + Status, Sleep (Score, Stadien deep/light/rem/awake, Start/End-Lokalzeit, Quality), VO₂ Max, Lactate Threshold (HR + Pace sec/km), Training Status, Race Predictions (5k/10k/HM/M in Sekunden).
- `training_plans` — Endurance-Phase-4 Top-Level (Race-Datum, Ziel-Pace, Peak-km/Woche, Sessions/Woche, totalWeeks, planStartDate, paceZonesJson, **referencePdfText** als extrahierter Volltext, Status draft/active/completed/archived).
- `training_plan_weeks` — eine Zeile pro Plan-Woche mit weekNumber, startDate/endDate, phase (base/build/peak/taper/race), targetVolumeKm. UNIQUE(planId, weekNumber).
- `training_plan_sessions` — eine Zeile pro Plan-Slot. Self-FK `alternativeOfId` macht eine Zeile zur Alternative ("Option 2") einer Primär-Session. `aiLocked` = KI-Sperre. `runSessionId` (FK → run_sessions, ON DELETE SET NULL) verlinkt zum tatsächlich absolvierten Lauf. UNIQUE(planId, date, dayOrder, alternativeOfId) erlaubt Double-Days und unabhängige Alternativen.
- `training_plan_blocks` — strukturierte Intervalle pro Session. `repetitions` × `segmentsJson` (TS-Typ `TrainingPlanBlockSegment[]` mit kind work/recovery/warmup/cooldown, durationSec/distanceMeters, zone/zoneMin/zoneMax, paceMinSec/paceMaxSec, hrMin/hrMax). UNIQUE(sessionId, blockOrder).

### 4.4 Integrationen (`src/lib/integrations/`)

| Datei | Zweck |
|---|---|
| `sheets.ts` | Google-Sheets-CSV-Parser → upsert WeightEntries (`sheetsAdapter.sync()`) |
| `fddb.ts` | Scraping von fddb.info per Cookie → NutritionEntries (`fddbAdapter.fetchNutritionEntries`) |
| `garmin.ts` | Stub für Garmin-Body-Composition (nicht implementiert) |
| `garmin-strength.ts` | **`getGarminClient()`** — authentifizierter GarminConnect-Client, Tokens in DB |
| `garmin-strength-import.ts` | `syncGarminStrength()` — Activities → WorkoutSessions+Sets, mit Alias-Mapping |
| `garmin-calories.ts` | `fetchDailyCalories(client, {since,until})` → DailyActivity |
| `garmin-runs-import.ts` | `syncGarminRuns({since,until,maxPages})` — paginierter Lauf-Import → run_sessions, idempotent via garminActivityId |
| `garmin-metrics.ts` | `syncGarminDailyMetrics({dates})` — RHR/HRV/Sleep aus offiziellen Methoden + VO₂/Race/LT aus undokumentierten Endpoints (`metrics-service/maxmet/latest/{date}`, `metrics-service/racepredictions/latest/{displayName}`, `biometric-service/biometric/latestLactateThreshold`) |
| `sync-all.ts` | `runAllSyncs()` — orchestriert alle 6 Syncs sequenziell mit safe()-Wrapper, vom Cron + UI-Sync-Button benutzt |
| `types.ts` | gemeinsame `SyncableAdapter`-Schnittstelle |

### 4.5 Utilities & Hypertrophy-Lib (`src/lib/`)

| Datei | Zweck |
|---|---|
| `site.ts` | Konstanten (App-Name, Navigation) |
| `utils.ts` | `cn()` (tailwind-merge) |
| `utils/csv.ts` | CSV-Parser für Sheets-Import |
| `utils/date.ts` | ISO-Date-Helper |
| `utils/iso-week.ts` | KW-Berechnung für Sheets-Spalten |
| `utils/loess.ts` | LOESS-Glättung für Weight-Chart-Trend |
| `utils/strength.ts` | e1RM-Formel, Volumen-Aggregation |
| `utils/weight-stats.ts` | Trend, Schwankung, Δ7d/Δ30d |
| `hypertrophy/muscles.ts` | Muskelgruppen-Definitionen |
| `hypertrophy/workouts.ts` | Template-Konfiguration (Cycle-Berechnung u.ä.) |
| `endurance/plan.ts` | Phase 4: `derivePaceZones`, `computePlanWeeks` (16w rückwärts vom Race), Pace/Zeit-Formatter (`formatPace`, `parseHmsToSeconds`, `formatSecondsAsHms`). Phasen-Verteilung skaliert auf totalWeeks (Default 16: 4-base, 5-build, 3-peak, 3-taper, 1-race). |
| `endurance/pdf-extract.ts` | Phase 4: `extractPdfText(file)` via `pdf-parse` v2 (`PDFParse`-Klasse). Server-only, dynamischer Import. |

### 4.6 Scripts (`scripts/`) — alle als `tsx` lokal, **nicht** in Vercel verfügbar

| Befehl | Datei | Zweck |
|---|---|---|
| `npm run db:migrate` | `src/lib/db/migrate.ts` | Drizzle-Migrationen ausführen |
| `npm run db:generate` | (drizzle-kit) | Neue Migration aus Schema-Diff erzeugen |
| `npm run db:studio` | (drizzle-kit) | Web-UI zum DB-Browsen |
| `npm run db:seed` | `scripts/seed.ts` | Initial-Daten Weight/Phasen |
| `npm run db:seed:hypertrophy` | `scripts/seed-hypertrophy.ts` | Übungen + Templates seeden |
| `npm run db:sync:sheets` | `scripts/sync-sheets.ts` | Manueller Weight-Sync aus Google Sheets |
| `npm run db:sync:garmin` | `scripts/sync-garmin-strength.ts` | Manueller Garmin-Strength-Sync |
| `npm run db:sync:garmin-calories` | `scripts/sync-garmin-calories.ts` | Manueller Garmin-Calories-Sync |
| `npm run db:sync:nutrition` | `scripts/sync-nutrition.ts` | Manueller FDDB-Sync |
| `npm run db:sync:garmin-runs` | `scripts/sync-garmin-runs.ts` | Garmin-Lauf-Sync. Flags: `--since=YYYY-MM-DD`, `--until=…`, `--dry-run`, `--max-pages=N` |
| `npm run db:sync:garmin-metrics` | `scripts/sync-garmin-metrics.ts` | Garmin-Daily-Metrics-Sync (RHR/HRV/Sleep/VO₂/LT/Race/Training-Status). Flags: `--days=N` (max 365), `--date=YYYY-MM-DD`, `--dry-run` |
| `npm run garmin:login-check` | `scripts/garmin-login-check.ts` | Garmin-Login testen |
| `npm run garmin:strength-list` | `scripts/garmin-strength-list.ts` | Garmin-Strength-Activities listen |
| `npx tsx scripts/migrate-to-turso.ts` | `scripts/migrate-to-turso.ts` | One-Shot: lokale DB → Turso kopieren |
| `npx tsx scripts/garmin-calories-probe.ts` | `scripts/garmin-calories-probe.ts` | Garmin-Calories-Endpoint debuggen |
| `npx tsx scripts/check-turso.ts` | `scripts/check-turso.ts` | Turso-Status-Check (Zeilen pro Endurance-Tabelle, Spalten) — env vorher laden: `set -a && source .env.local && set +a && …` |

### 4.7 Migrationen (`drizzle/`)

Sequenz `0000` → `0012`. **Nicht editieren** — Drizzle hält im `meta/_journal.json` einen Hash; geänderte Migrationen führen zu Fehlern. Neue Schema-Änderungen → `npm run db:generate` erzeugt das nächste File.

| Migration | Inhalt |
|---|---|
| `0000` … `0001` | Initial Weight-Schema |
| `0002` … `0004` | Hypertrophy-Tabellen, Exercises, Templates, Sessions, Sets |
| `0005` | `session_exercise_overrides` |
| `0006` | `nutrition_entries` |
| `0007` | `daily_activity` |
| `0008` | `weight_entries.cheat_meal` + `kcal_target` |
| `0009` | `garmin_tokens` |
| `0010` | `run_sessions` + `garmin_daily_metrics` (Endurance) |
| `0011` | `garmin_daily_metrics`-Erweiterung: Sleep-Stadien, HRV-Baseline, RHR-7d-Avg |
| `0012` | `daily_tags`-Tabelle, Tag-Daten aus `weight_entries` rüberkopiert, `cheat_day`/`alcohol`/`cheat_meal`/`kcal_target` aus `weight_entries` entfernt — **manuell editiert** (INSERT vor DROP), nicht regenerieren |
| `0013` | Endurance Phase 4: `training_plans` + `training_plan_weeks` + `training_plan_sessions` + `training_plan_blocks`. Self-FK auf `alternative_of_id` (kein DB-Constraint, App-Logik), FK auf `run_sessions.id` mit ON DELETE SET NULL. |

### 4.8 Konfig-Files (Root)

| Datei | Zweck |
|---|---|
| `next.config.ts` | Next-Config |
| `drizzle.config.ts` | Drizzle-Kit-Config, Dialect "turso", DB-URL via ENV |
| `vercel.json` | Cron-Schedule `0 4 * * *` → `/api/cron/sync` |
| `tsconfig.json` | TypeScript strict |
| `components.json` | shadcn/ui-Config |
| `eslint.config.mjs` | ESLint flat config |
| `postcss.config.mjs` | Tailwind v4 PostCSS |
| `CLAUDE.md` | lädt `AGENTS.md` + `CONTEXT.md` automatisch in Claude-Sessions |
| `AGENTS.md` | Next.js-Version-Warnung |

## 5. Funktions-Inventar — `src/lib/db/queries.ts`

Alle Funktionen sind `async` und liefern `Promise<T>`. Wenn etwas fehlt, gehört es hierhin (NICHT direkt `db.select()` in Pages/Components).

**Weight:**
- `getAllWeightEntries()` — alle, chronologisch
- `getRecentWeightEntries(limit=10)`
- `getWeightEntryByDate(date)`
- `upsertWeightEntry(entry)` — Konflikt auf `date`, behält undefined-Felder. Schreibt nur weight/source/notes (Tags wandern in daily_tags).
- `updateWeightMetadata(date, patch)` — nur notes/source
- `deleteWeightEntry(id)` / `deleteWeightEntryByDate(date)` / `clearAllWeightEntries()`
- `previousDayIso(iso)` — pure date util (sync)

**Daily Tags:**
- `getAllDailyTags()` / `getDailyTagsMap()` — Map<date, DailyTag>
- `getDailyTagForDate(date)`
- `upsertDailyTag(input)` — Konflikt auf `date`, undefined-Felder bleiben unverändert
- `deleteDailyTag(date)`

**Phasen:**
- `getAllPhases()` / `upsertPhase()` / `deletePhase(id)` / `clearAllPhases()`

**Hypertrophy — Templates + Übungen:**
- `getAllTemplates()` / `getTemplateBySlug(slug)` / `getTemplateByKind(kind)`
- `getTemplateExercises(templateId)` — Slots in Reihenfolge mit Stammdaten
- `getExerciseBySlug(slug)`
- `getTemplateExerciseBySlug(templateId, exerciseSlug)`
- `buildExerciseAliasMap()` — Map<alias, exerciseId> für Garmin-Import

**Sessions + Sets:**
- `getSessionsByTemplate(templateId)` / `getAllSessions()`
- `getSession(templateId, date)` / `getSessionById(id)` / `getSessionByGarminId(id)`
- `createSession(input)` / `deleteSession(id)` / `updateSessionNotes(id, notes)`
- `getSetsBySession(sessionId)` / `getSetsByTemplateExercise(templateExerciseId)`
- `upsertSet(input)` — Konflikt auf (session,templateExercise,setNumber)
- `getSetById(id)` / `updateSetWeightMode(id, mode)` / `deleteSet(id)`
- `cycleNumberFor(templateId, date)` — wievielte Ausführung

**Session-Overrides:**
- `getOverridesForSession(sessionId)`
- `upsertSessionExerciseOverride(input)` / `deleteSessionExerciseOverride(sessionId, templateExerciseId)`

**Progress-Indikator:**
- `getPreviousSessionSetsForSlot(templateExerciseId, excludeSessionId, beforeDate)` — letzte Werte für Slot

**Nutrition:**
- `getNutritionEntries({from?, to?, source?})`
- `getNutritionForDate(date, source="fddb")`
- `upsertNutritionEntry(entry)` — Konflikt auf (date, source)

**Daily Activity (Garmin Kalorien):**
- `getDailyActivityEntries({from?, to?, source?})`
- `getDailyActivityForDate(date, source="garmin")`
- `upsertDailyActivity(entry)`

**Garmin Tokens:**
- `getGarminTokens()` — single row id=1
- `saveGarminTokens(oauth1Json, oauth2Json)`

**Endurance — Run-Sessions:**
- `getAllRunSessions()` / `getRunSessionsBetween(from, to)` / `getRunSessionsForDate(date)`
- `getRunSessionByDate(date)` (jüngster Lauf des Tages) / `getRunSessionByGarminId(id)` (Idempotenz)
- `getLatestRunSession()` (Preview für Cards)
- `upsertRunSession(input)` — Konflikt auf `garminActivityId`
- `getWeeklyKmTotals(fromIso, toIso)` — SQL-Aggregation, Montags-Wochenstart, liefert `{ weekStartIso, km }`

**Endurance — Garmin Daily Metrics:**
- `getDailyMetricsForDate(date)`
- `getDailyMetricsBetween(from, to)` — für 8-Wochen-Trend-Charts
- `getLatestDailyMetrics()` — Tile-Preview
- `upsertDailyMetrics(entry)` — Konflikt auf `date`

**Endurance Phase 4 — Training Plans:**
- Plans: `getAllTrainingPlans()`, `getTrainingPlanById(id)`, `getActiveTrainingPlan()` (nur status=active), `getCurrentTrainingPlan()` (active **oder** draft — für UI), `createTrainingPlan(input)`, `updateTrainingPlan(id, patch)`, `setTrainingPlanStatus(id, status)`, `deleteTrainingPlan(id)`
- Weeks: `getWeeksForPlan(planId)`, `getWeekByNumber(planId, n)`, `getWeekForDate(planId, date)`, `createPlanWeek(input)`, `insertPlanWeeks(weeks[])` (Bulk-Insert), `updatePlanWeek(id, patch)`
- Sessions: `getSessionsForPlan(planId)` (primary only), `getPlanSessionsForWeek(weekId)`, `getPlanSessionsForDateRange(planId, from, to)`, `getPlanSessionById(id)`, `getNextPlanSession(planId, todayIso)`, `getAlternativesForPlanSession(primaryId)`, `createPlanSession(input)`, `insertPlanSessions(sessions[])` (Bulk für KI-Generierung), `updatePlanSession(id, patch)`, `updatePlanSessionDate(id, newDate, dayOrder?)`, `setPlanSessionAiLocked(id, locked)`, `linkPlanSessionToRun(id, runSessionId)`, `deletePlanSession(id)`
- Blocks: `getBlocksForPlanSession(sessionId)`, `createPlanBlock(input)`, `insertPlanBlocks(blocks[])` (Bulk), `replacePlanBlocksForSession(sessionId, blocks[])` (atomarer Ersatz aller Blocks einer Session), `deletePlanBlock(id)`

### Endurance Phase 4 — KI-Plan-Generierung (Sprint 3)

- `src/lib/endurance/ai-schema.ts` — Tool-Use-Schema `CREATE_TRAINING_CHUNK_TOOL` (Anthropic.Tool) + TS-Typen `AiSession`/`AiSessionBlock`/`AiChunkOutput`
- `src/lib/endurance/ai-prompts.ts` — `SYSTEM_METHODOLOGY` (stabiler System-Prompt) + `buildPlanContextBlock(plan)` (Plan-Settings + Pace-Zonen + Referenz-PDF, **cached** via cache_control) + `buildChunkUserMessage(weeks, ctx)`
- `src/lib/endurance/ai-generator.ts` — `generateChunk(plan, weeks, model)`: Claude-Call mit `tool_choice: {type: "tool"}` (forciert strukturierten Output), Modell-Switching `sonnet` (`claude-sonnet-4-6`) ↔ `opus` (`claude-opus-4-8`). `chunkWeeks(weeks)` schneidet in 4er-Päckchen. **Wichtig:** `thinking` ist mit forced tool-use inkompatibel → wird nicht gesetzt.
- Server Action `generatePlanSessions(planId, options?)` in `src/app/endurance/recommendations/actions.ts` — orchestriert: validiert draft+leer → für jeden Chunk Claude-Call → Bulk-Insert primary Sessions + Blocks + Alternativen → Status auf `active`. **maxDuration=60 lebt auf der page.tsx** (nicht im "use server"-File, da nur async Exports erlaubt).
- UI-Trigger: `src/components/endurance/PlanGeneratorButton.tsx` (Client) mit Modell-Wahl, Pending-State, Result-Box. Sichtbar wenn `status=draft && sessions.length === 0`.

**Bekannte Limits Sprint 3:**
- **Vercel 60s Action-Timeout vs. ~3-4min Gesamtzeit für 16 Wochen / 4 Chunks** → lokal OK, Production-Deploy braucht client-orchestriertes Chunking (mehrere Action-Calls). TODO vor Production-Deploy.
- **`dayOfWeek=0` von KI nicht abgefangen** → kann zu Session-Datum 1 Tag vor Plan-Start führen. Bisher nur lokal beobachtet (1 von 121 Sessions). Server-Validierung in Sprint 4 (Edit-Session-Logik) nachrüsten.
- **Migration 0013 muss vor S3-Production-Deploy auch gegen Turso laufen** (`USE_TURSO=1 npm run db:migrate`).

## 6. Dev-Workflow

### Setup nach `git clone`
```bash
npm install
cp .env.example .env.local  # Werte ergänzen
npm run db:migrate          # erstellt data/health.db lokal
npm run db:seed             # optional: Initialdaten
npm run dev                 # http://localhost:3000
```

### Schema ändern
1. Schema-Eintrag in `src/lib/db/schema.ts` ergänzen
2. `npm run db:generate` → neue Migration in `drizzle/`
3. `npm run db:migrate` → lokal anwenden
4. Beim nächsten Vercel-Deploy: Migrationen müssen gegen Turso laufen — **derzeit manuell:** `USE_TURSO=1 npm run db:migrate` vor dem Push
   - Alternativ: in den Cron-Endpoint einbauen oder ein Vercel-Build-Hook (TODO falls Schema-Changes häufig werden)

### Tests vor Push
```bash
node_modules/.bin/tsc --noEmit    # tsc clean? (reicht NICHT alleine — siehe Gotcha §7)
npm run build                      # **Pflicht** — Vercels Build ist strenger als tsc --noEmit
npm run lint                       # ESLint
npm run dev                        # smoke-test
```

> **Wichtig:** `tsc --noEmit` allein reicht nicht. Vercels `next build` prüft mit strikterer Konfig und erwischt Type-Probleme in Files, die `tsc` lokal überspringt (z.B. Scripts in `scripts/`). Erfahrung: Commit 6800aa0 — lokal clean, Vercel-Build failed.

### Push-Flow
```bash
git add -A
git commit -m "..."
git push origin main   # Vercel deployed automatisch
```

### Lokal gegen Turso testen (selten nötig)
```bash
USE_TURSO=1 npm run dev
```

## 7. Bekannte Eigenheiten / Gotchas

- **`db.select()...get()`** liefert `undefined` wenn nichts gefunden. In TS Bereich: `WeightEntry | undefined`.
- **`db.insert()...returning()`** liefert ein Array — wir destructuren `const [row] = await ...`.
- **Server Components** dürfen async sein und direkt `await query()` machen. **Client Components NICHT** — sie holen Daten via Server Actions oder Props.
- **Recharts** wirft im Dev manchmal `width(-1) and height(-1)`-Warnings beim SSR — harmlos, layout greift im Client.
- **`@gooin/garmin-connect`** verwendet OAuth-Tokens; bei MFA-aktiviertem Garmin-Account funktioniert die Library aktuell nicht. Tokens leben jetzt in `garmin_tokens`-Tabelle (siehe Migration 0009).
- **FDDB-Cookie** läuft regelmäßig ab; wenn der Cron-Job fehlschlägt mit „Unauthorized" → Cookie aus Browser neu kopieren und in `FDDB_COOKIE` (Vercel + lokal) updaten.
- **Vercel Hobby-Plan**: Cron läuft max. 1x/Tag, Endpoint-Timeout max. 60s. 6 sequenzielle Syncs sollten in <50s durchlaufen; wenn nicht, in `maxDuration` ggf. erhöhen oder Syncs parallelisieren (`Promise.allSettled`).
- **Vercel-Build > tsc**: Vercels `next build` ist strenger als `node_modules/.bin/tsc --noEmit`. Vor jedem Push immer **zusätzlich** `npm run build` lokal laufen lassen — sonst kann ein Type-Error in `scripts/` o.ä. erst beim Deploy auffallen (passiert in Commit 6800aa0).
- **Migrate-Script lädt nur `.env`, nicht `.env.local`**: Für `USE_TURSO=1 npm run db:migrate` müssen Turso-Vars vorab exportiert werden: `set -a && source .env.local && set +a && USE_TURSO=1 npm run db:migrate`. Gleiches gilt für `npx tsx scripts/check-turso.ts`.
- **Garmin-Endpoints für Endurance** sind undokumentiert und haben unterschiedliche Pfad-Patterns:
  - `metrics-service/metrics/maxmet/latest/{YYYY-MM-DD}` (VO₂ Max) — **Datum** als Suffix
  - `metrics-service/metrics/racepredictions/latest/{displayName}` — **displayName** als Suffix
  - `biometric-service/biometric/latestLactateThreshold` — keine Pfad-Parameter, liefert Array mit Einträgen für `speed` und `hearRate` (Garmin-Tippfehler: tatsächlich ohne „t"). LT-Pace = `1000 / (speed × 10)` — die Skalierung mit ×10 ist empirisch korrigiert, weil Garmin's `speed`-Wert um eine Größenordnung zu klein kommt.
- **Drizzle SQLite DROP COLUMN**: `npm run db:generate` produziert bei Spalten-Entfernung `ALTER TABLE … DROP COLUMN` ohne Datenmigration. Wenn die alten Daten erhalten bleiben sollen (wie bei Migration 0012 für Tags), die generierte `.sql`-Datei **manuell** um eine `INSERT INTO neu SELECT … FROM alt …`-Anweisung VOR dem DROP erweitern.
- **Tag-Refactor (Migration 0012)**: Tag-Felder (cheatDay/alcohol/cheatMeal/kcalTarget) leben jetzt in `daily_tags`, NICHT mehr in `weight_entries`. Alle Komponenten, die Tags pro Datum brauchen, holen sich einen separaten `tags`-Prop (siehe WeightChartSection, NutritionChartSection, NutritionCorrelationView). Tag-Bearbeitung via Day-Detail-Dialog im Weight-Chart ODER Tag-Editor auf `/weight/tags`.
