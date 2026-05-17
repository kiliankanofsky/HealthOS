# HealthOS — Projekt-Kontext

> **Sinn dieser Datei:** Schneller Einstieg in das Projekt ohne den gesamten Code zu lesen. Hier stehen Architektur, Datei-Index, Funktions-Übersicht und Deployment-Constraints.
> Bei größeren Umbauten diese Datei bitte aktualisieren.

## 1. Was ist HealthOS

Privates Self-Tracking-Tool für einen einzelnen Nutzer (kiliankanofsky). Drei Module:

- **Weight** (Phase 1, live): Gewichtsverlauf aus Google Sheets, Trend, Phasen (cut/bulk/maintenance), Tagesmetadaten (Cheat-Day/Meal, Alkohol, kcal-Ziel)
- **Hypertrophy** (Phase 2, live): Krafttrainings-Logger mit Templates (Upper-A / Lower / Upper-B), Sätze pro Übung, Garmin-Sync für Trainingsdaten, Per-Übung-Progress-Chart
- **Endurance** (Phase 3, "soon"): noch nicht gebaut

Zusatz: **Nutrition** (FDDB-Sync, Tageskalorien + Makros) und **Daily Activity** (Garmin-Gesamtkalorien) als Erweiterungen.

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

`vercel.json` definiert: `0 4 * * *` UTC (= 05:00/06:00 lokal je nach Sommer/Winter) → `GET /api/cron/sync`. Vercel sendet `Authorization: Bearer ${CRON_SECRET}`. Endpoint führt 4 Syncs hintereinander aus (sheets, garmin-strength, garmin-calories, nutrition) und gibt ein Summary-JSON zurück.

## 4. Datei-Index

### 4.1 App-Routen (`src/app/`)

| Pfad | Typ | Zweck |
|---|---|---|
| `layout.tsx` | RSC | Root-Layout, Fonts, globaler `AppShell` |
| `page.tsx` | RSC | Homescreen — Hero-Grid + PulseSection (Live-Stats Weight/Hypertrophy) |
| `weight/page.tsx` | RSC | Weight-Dashboard: Chart, Stats, Phasen, Day-Detail |
| `weight/entries/page.tsx` | RSC | Tabelle aller Weight-Einträge |
| `weight/actions.ts` | Server Action | upsert/delete/updateMetadata für Weight + Phasen |
| `hypertrophy/page.tsx` | RSC | Templates-Übersicht + Kalender + Workout-Cards |
| `hypertrophy/[slug]/page.tsx` | RSC | Template-Detail (alle Sessions) |
| `hypertrophy/[slug]/[date]/page.tsx` | RSC | Session-Detail mit Sets-Logger |
| `hypertrophy/[slug]/exercise/[exerciseSlug]/page.tsx` | RSC | Per-Übung-Progress-Chart |
| `hypertrophy/actions.ts` | Server Action | createSession / upsertSet / updateNotes / overrides |
| `nutrition/page.tsx` | RSC | Nutrition-Chart + Korrelation mit Weight |
| `endurance/page.tsx` | RSC | Stub-Page „Soon" |
| `api/cron/sync/route.ts` | Route Handler | **GET** mit Bearer-Auth, führt alle 4 Syncs aus |

### 4.2 Komponenten (`src/components/`)

Nach Modul gruppiert. **RSC** = Server Component, **CC** = Client Component (`"use client"`).

- `site/` — `AppShell` (Wrapper), `SiteHeader`, `SiteFooter`
- `home/` — `HeroGrid`, `PromoBar`, `PulseSection` (RSC, lädt Live-Stats), `SectionHero`, `Topbar`
- `weight/` — `WeightChart`/`Chart Section` (Recharts, CC), `WeightStats`, `WeightTable`, `WeightWeekMatrix`, `WeightDayList`, `WeightDayDetailDialog` (CC), `WeightDetailView`, `WeightEntryForm` (CC), `PhaseEditDialog` (CC)
- `hypertrophy/` — `Calendar`, `SessionLogger` (CC), `NewSessionDialog` (CC), `DeleteSessionButton` (CC), `OpenOrCreateSessionButton` (CC), `ExerciseProgressChart` (CC), `WorkoutCards` (RSC), `WorkoutOverviewChart`, `SiblingNavButtons`/`SiblingSwipe`
- `hypertrophy/avatar/` — `MuscleAvatar` (SVG-Bodymap), `OverviewAvatarPanel`, `WorkoutAvatarPanel`, `MuscleExerciseList`, `anatomy-paths.ts` (SVG-Pfade)
- `nutrition/` — `NutritionChart` + `ChartSection`, `NutritionCorrelationView` (Streudiagramm Weight×Kalorien), `NutritionDayDetailDialog`
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
- `weight_entries` — Gewicht pro Tag + Tags (cheatDay, alcohol, cheatMeal, kcalTarget)
- `weight_phases` — cut/bulk/maintenance-Zeiträume
- `exercises` — Stamm-Übungen mit Aliases (für Garmin-Mapping) und Muskelgruppen
- `workout_templates` — Upper-A / Lower / Upper-B
- `workout_template_exercises` — Slots pro Template (Position, Default-Reps)
- `workout_sessions` — eine Trainings-Instanz (Template + Datum)
- `workout_sets` — einzelne Sätze pro Session (sessionId, templateExerciseId, setNumber, weight, reps)
- `session_exercise_overrides` — alternative Übung pro Slot pro Session (wenn Gerät besetzt war)
- `nutrition_entries` — Tageskalorien + Makros aus FDDB
- `daily_activity` — Tagesgesamtkalorien aus Garmin (total/aktiv/BMR/Schritte)
- `garmin_tokens` — OAuth1+OAuth2-Tokens (single-row, id=1) — **ersetzt File-Cache**

### 4.4 Integrationen (`src/lib/integrations/`)

| Datei | Zweck |
|---|---|
| `sheets.ts` | Google-Sheets-CSV-Parser → upsert WeightEntries (`sheetsAdapter.sync()`) |
| `fddb.ts` | Scraping von fddb.info per Cookie → NutritionEntries (`fddbAdapter.fetchNutritionEntries`) |
| `garmin.ts` | Stub für Garmin-Body-Composition (nicht implementiert) |
| `garmin-strength.ts` | **`getGarminClient()`** — authentifizierter GarminConnect-Client, Tokens in DB |
| `garmin-strength-import.ts` | `syncGarminStrength()` — Activities → WorkoutSessions+Sets, mit Alias-Mapping |
| `garmin-calories.ts` | `fetchDailyCalories(client, {since,until})` → DailyActivity |
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
| `npm run garmin:login-check` | `scripts/garmin-login-check.ts` | Garmin-Login testen |
| `npm run garmin:strength-list` | `scripts/garmin-strength-list.ts` | Garmin-Strength-Activities listen |
| `npx tsx scripts/migrate-to-turso.ts` | `scripts/migrate-to-turso.ts` | One-Shot: lokale DB → Turso kopieren |
| `npx tsx scripts/garmin-calories-probe.ts` | `scripts/garmin-calories-probe.ts` | Garmin-Calories-Endpoint debuggen |

### 4.7 Migrationen (`drizzle/`)

Sequenz `0000` → `0009`. **Nicht editieren** — Drizzle hält im `meta/_journal.json` einen Hash; geänderte Migrationen führen zu Fehlern. Neue Schema-Änderungen → `npm run db:generate` erzeugt das nächste File.

| Migration | Inhalt |
|---|---|
| `0000` … `0001` | Initial Weight-Schema |
| `0002` … `0004` | Hypertrophy-Tabellen, Exercises, Templates, Sessions, Sets |
| `0005` | `session_exercise_overrides` |
| `0006` | `nutrition_entries` |
| `0007` | `daily_activity` |
| `0008` | `weight_entries.cheat_meal` + `kcal_target` |
| `0009` | `garmin_tokens` |

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
- `upsertWeightEntry(entry)` — Konflikt auf `date`, behält undefined-Felder
- `updateWeightMetadata(date, patch)` — nur Tags
- `deleteWeightEntry(id)` / `deleteWeightEntryByDate(date)` / `clearAllWeightEntries()`
- `previousDayIso(iso)` — pure date util (sync)

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
node_modules/.bin/tsc --noEmit    # tsc clean? Vercel-Build hängt sonst
npm run lint                       # ESLint
npm run dev                        # smoke-test
```

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
- **Vercel Hobby-Plan**: Cron läuft max. 1x/Tag, Endpoint-Timeout max. 60s. 4 sequenzielle Syncs sollten in <30s durchlaufen; wenn nicht, in `maxDuration` ggf. erhöhen oder Syncs parallelisieren (`Promise.allSettled`).
