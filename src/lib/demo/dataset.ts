// Generator für die öffentlichen Demo-Daten.
//
// Reine Funktion: erzeugt aus einem Anker-Datum ("heute") einen kompletten,
// in sich stimmigen Datensatz für ALLE Module. Kein DB-Zugriff — das
// Einspielen macht lib/demo/seed.ts.
//
// Zwei Prinzipien:
//  1. Alles ist relativ zu `todayIso`. Die App rechnet überall mit „diese
//     Woche" / „nächste Session"; ein fixes Datum würde das Dashboard nach
//     wenigen Tagen leer aussehen lassen.
//  2. Deterministisch (fester PRNG-Seed). Beim täglichen Neuaufbau
//     verschiebt sich der Datensatz, aber seine Form bleibt gleich.
//
// Die Persona ist bewusst Durchschnitt und nicht Leistungssport: 31 Jahre,
// 1,80 m, ~79 kg, Ruhepuls 52, VO₂max 49, Marathon-Prognose 3:45 h.

import type { RunLap } from "@/lib/db/schema";

// ---------------------------------------------------------------- Basics ---

/** Kleiner deterministischer PRNG (mulberry32). */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 1 = Montag … 7 = Sonntag (ISO). */
function isoWeekday(iso: string): number {
  const wd = new Date(`${iso}T00:00:00`).getDay();
  return wd === 0 ? 7 : wd;
}

/** Montag der Woche, in der `iso` liegt. */
function mondayOf(iso: string): string {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Zeitstempel im Garmin-Stil: Lokalzeit ohne Offset. */
function localStamp(iso: string, hour: number, minute: number): string {
  return `${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

// --------------------------------------------------------- Zeit-Horizonte ---

const WEIGHT_DAYS = 210;
const NUTRITION_DAYS = 120;
const METRICS_DAYS = 120;
const RUN_DAYS = 182; // 26 Wochen — deckt das 180-Tage-Fenster der Zonen-Schätzung
const GYM_WEEKS = 24;
const PLAN_TOTAL_WEEKS = 16;
const PLAN_WEEKS_ELAPSED = 6; // Plan läuft seit 6 Wochen → Race in ~10 Wochen

// ------------------------------------------------------------- Typen (out) ---

export type DemoExercise = {
  slug: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  defaultRepMin: number;
  defaultRepMax: number;
  unilateral: boolean;
};

export type DemoTemplate = {
  slug: string;
  name: string;
  color: string;
  letter: string;
  sortOrder: number;
  exercises: {
    slug: string;
    defaultSets: number;
    weightMode: "per-side" | "summed";
    startKg: number;
    endKg: number;
    step: number;
  }[];
};

export type DemoWorkoutSet = {
  templateSlug: string;
  date: string;
  exerciseSlug: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  weightMode: "per-side" | "summed";
};

export type DemoPlanBlock = {
  blockOrder: number;
  repetitions: number;
  description: string | null;
  segments: {
    kind: "warmup" | "work" | "recovery" | "cooldown";
    durationSec?: number;
    distanceMeters?: number;
    zone?: number;
    description?: string;
  }[];
};

export type DemoPlanSession = {
  weekNumber: number;
  date: string;
  dayOrder: number;
  sessionType: "recovery" | "easy" | "tempo" | "threshold" | "vo2max" | "long";
  title: string;
  description: string | null;
  targetDurationSec: number;
  targetDistanceMeters: number;
  primaryZone: number;
  status: "planned" | "completed" | "skipped" | "modified";
  blocks: DemoPlanBlock[];
};

export type DemoDataset = ReturnType<typeof buildDemoDataset>;

// ------------------------------------------------------------ Stammdaten ---

const EXERCISES: DemoExercise[] = [
  // Push
  { slug: "bankdruecken", name: "Bankdrücken", primaryMuscles: ["chest"], secondaryMuscles: ["front-delt", "triceps"], defaultRepMin: 5, defaultRepMax: 8, unilateral: false },
  { slug: "schraegbankdruecken-kh", name: "Schrägbankdrücken (KH)", primaryMuscles: ["chest-upper"], secondaryMuscles: ["front-delt", "triceps"], defaultRepMin: 8, defaultRepMax: 12, unilateral: true },
  { slug: "schulterdruecken-maschine", name: "Schulterdrücken Maschine", primaryMuscles: ["front-delt"], secondaryMuscles: ["side-delt", "triceps"], defaultRepMin: 8, defaultRepMax: 12, unilateral: false },
  { slug: "kabelzug-fliegende", name: "Kabelzug Fliegende", primaryMuscles: ["chest"], secondaryMuscles: ["front-delt"], defaultRepMin: 12, defaultRepMax: 15, unilateral: false },
  { slug: "seitheben", name: "Seitheben", primaryMuscles: ["side-delt"], secondaryMuscles: [], defaultRepMin: 12, defaultRepMax: 15, unilateral: true },
  { slug: "trizepsdruecken-kabel", name: "Trizepsdrücken am Kabel", primaryMuscles: ["triceps"], secondaryMuscles: [], defaultRepMin: 10, defaultRepMax: 15, unilateral: false },
  { slug: "bauchpresse-kabel", name: "Bauchpresse am Kabel", primaryMuscles: ["abs"], secondaryMuscles: ["core"], defaultRepMin: 12, defaultRepMax: 15, unilateral: false },

  // Pull
  { slug: "kreuzheben", name: "Kreuzheben", primaryMuscles: ["lower-back"], secondaryMuscles: ["glutes", "hamstrings", "upper-back"], defaultRepMin: 5, defaultRepMax: 8, unilateral: false },
  { slug: "latzug", name: "Latzug", primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "upper-back"], defaultRepMin: 8, defaultRepMax: 12, unilateral: false },
  { slug: "langhantelrudern", name: "Langhantelrudern", primaryMuscles: ["mid-back"], secondaryMuscles: ["lats", "upper-back", "biceps"], defaultRepMin: 8, defaultRepMax: 12, unilateral: false },
  { slug: "rudern-kabel", name: "Rudern am Kabel", primaryMuscles: ["upper-back"], secondaryMuscles: ["lats", "mid-back", "rear-delt", "biceps"], defaultRepMin: 10, defaultRepMax: 12, unilateral: false },
  { slug: "reverse-butterfly", name: "Reverse Butterfly", primaryMuscles: ["rear-delt"], secondaryMuscles: ["upper-back"], defaultRepMin: 12, defaultRepMax: 15, unilateral: false },
  { slug: "langhantel-curls", name: "Langhantel-Curls", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"], defaultRepMin: 8, defaultRepMax: 12, unilateral: false },
  { slug: "hammer-curls", name: "Hammer-Curls", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"], defaultRepMin: 10, defaultRepMax: 12, unilateral: true },

  // Beine
  { slug: "kniebeuge", name: "Kniebeuge", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "core", "lower-back"], defaultRepMin: 5, defaultRepMax: 8, unilateral: false },
  { slug: "rumaenisches-kreuzheben", name: "Rumänisches Kreuzheben", primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower-back"], defaultRepMin: 8, defaultRepMax: 12, unilateral: false },
  { slug: "beinpresse", name: "Beinpresse", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"], defaultRepMin: 10, defaultRepMax: 12, unilateral: false },
  { slug: "beinbeuger", name: "Beinbeuger", primaryMuscles: ["hamstrings"], secondaryMuscles: [], defaultRepMin: 10, defaultRepMax: 15, unilateral: false },
  { slug: "beinstrecker", name: "Beinstrecker", primaryMuscles: ["quads"], secondaryMuscles: [], defaultRepMin: 12, defaultRepMax: 15, unilateral: false },
  { slug: "hip-thrust", name: "Hip Thrust", primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"], defaultRepMin: 8, defaultRepMax: 12, unilateral: false },
  { slug: "wadenheben-stehend", name: "Wadenheben stehend", primaryMuscles: ["calves"], secondaryMuscles: [], defaultRepMin: 12, defaultRepMax: 20, unilateral: false },
  { slug: "bauchmaschine", name: "Bauchmaschine", primaryMuscles: ["abs"], secondaryMuscles: ["core"], defaultRepMin: 12, defaultRepMax: 15, unilateral: false },
];

const TEMPLATES: DemoTemplate[] = [
  {
    slug: "push",
    name: "Push",
    color: "rose",
    letter: "P",
    sortOrder: 0,
    exercises: [
      { slug: "bankdruecken", defaultSets: 4, weightMode: "summed", startKg: 62.5, endKg: 77.5, step: 2.5 },
      { slug: "schraegbankdruecken-kh", defaultSets: 4, weightMode: "per-side", startKg: 22, endKg: 30, step: 2 },
      { slug: "schulterdruecken-maschine", defaultSets: 3, weightMode: "summed", startKg: 40, endKg: 52.5, step: 2.5 },
      { slug: "kabelzug-fliegende", defaultSets: 3, weightMode: "per-side", startKg: 11, endKg: 16, step: 1 },
      { slug: "seitheben", defaultSets: 3, weightMode: "per-side", startKg: 8, endKg: 12, step: 1 },
      { slug: "trizepsdruecken-kabel", defaultSets: 3, weightMode: "summed", startKg: 25, endKg: 35, step: 2.5 },
      { slug: "bauchpresse-kabel", defaultSets: 3, weightMode: "summed", startKg: 30, endKg: 42.5, step: 2.5 },
    ],
  },
  {
    slug: "pull",
    name: "Pull",
    color: "sky",
    letter: "Z",
    sortOrder: 1,
    exercises: [
      { slug: "kreuzheben", defaultSets: 3, weightMode: "summed", startKg: 100, endKg: 125, step: 5 },
      { slug: "latzug", defaultSets: 4, weightMode: "summed", startKg: 55, endKg: 70, step: 2.5 },
      { slug: "langhantelrudern", defaultSets: 3, weightMode: "summed", startKg: 55, endKg: 70, step: 2.5 },
      { slug: "rudern-kabel", defaultSets: 3, weightMode: "summed", startKg: 50, endKg: 65, step: 2.5 },
      { slug: "reverse-butterfly", defaultSets: 3, weightMode: "summed", startKg: 25, endKg: 35, step: 2.5 },
      { slug: "langhantel-curls", defaultSets: 3, weightMode: "summed", startKg: 25, endKg: 34, step: 1.5 },
      { slug: "hammer-curls", defaultSets: 3, weightMode: "per-side", startKg: 12, endKg: 17, step: 1 },
    ],
  },
  {
    slug: "beine",
    name: "Beine",
    color: "lime",
    letter: "B",
    sortOrder: 2,
    exercises: [
      { slug: "kniebeuge", defaultSets: 4, weightMode: "summed", startKg: 80, endKg: 102.5, step: 2.5 },
      { slug: "rumaenisches-kreuzheben", defaultSets: 3, weightMode: "summed", startKg: 70, endKg: 90, step: 5 },
      { slug: "beinpresse", defaultSets: 3, weightMode: "summed", startKg: 150, endKg: 195, step: 10 },
      { slug: "beinbeuger", defaultSets: 3, weightMode: "summed", startKg: 40, endKg: 55, step: 2.5 },
      { slug: "beinstrecker", defaultSets: 3, weightMode: "summed", startKg: 45, endKg: 60, step: 2.5 },
      { slug: "hip-thrust", defaultSets: 3, weightMode: "summed", startKg: 80, endKg: 110, step: 5 },
      { slug: "wadenheben-stehend", defaultSets: 4, weightMode: "summed", startKg: 60, endKg: 80, step: 5 },
      { slug: "bauchmaschine", defaultSets: 3, weightMode: "summed", startKg: 45, endKg: 60, step: 2.5 },
    ],
  },
];

/** Mo = Push, Mi = Pull, Fr = Beine. */
const GYM_SCHEDULE: Record<number, string> = { 1: "push", 3: "pull", 5: "beine" };

// ----------------------------------------------------------------- Gewicht ---

type PhaseSpec = {
  kind: "bulk" | "cut" | "maintenance";
  label: string;
  fromDay: number; // negative Tage relativ zu heute
  toDay: number | null;
  startKg: number;
  endKg: number;
};

function buildPhaseSpecs(): PhaseSpec[] {
  return [
    { kind: "maintenance", label: "Erhalt", fromDay: -WEIGHT_DAYS, toDay: -151, startKg: 79.0, endKg: 79.2 },
    { kind: "bulk", label: "Aufbau", fromDay: -150, toDay: -71, startKg: 79.2, endKg: 83.4 },
    { kind: "cut", label: "Diät", fromDay: -70, toDay: null, startKg: 83.4, endKg: 78.9 },
  ];
}

function trueWeightFor(dayOffset: number, phases: PhaseSpec[]): number {
  const phase = phases.find(
    (p) => dayOffset >= p.fromDay && (p.toDay === null || dayOffset <= p.toDay),
  );
  if (!phase) return 79;
  const span = (phase.toDay ?? 0) - phase.fromDay;
  const t = span === 0 ? 1 : (dayOffset - phase.fromDay) / span;
  return phase.startKg + (phase.endKg - phase.startKg) * t;
}

// ------------------------------------------------------------------ Läufe ---

type RunPlanEntry = {
  kind: "easy" | "long" | "tempo" | "intervals" | "recovery";
  km: number;
  hr: number;
};

/** Wochenstruktur: Di leicht, Do Qualität, Sa locker, So lang. */
function runPlanFor(weekday: number, weekIndex: number, rand: () => number): RunPlanEntry | null {
  switch (weekday) {
    case 2:
      return { kind: "easy", km: 8 + Math.round(rand() * 2), hr: 141 };
    case 4:
      return weekIndex % 2 === 0
        ? { kind: "intervals", km: 11, hr: 158 }
        : { kind: "tempo", km: 12, hr: 162 };
    case 6:
      // Bewusst unter 80 % der LTHR (168 → 134 bpm): nur so sammeln sich
      // echte Zone-1-Splits, aus denen zone-estimation.ts eine beobachtete
      // Z1-Pace ableiten kann statt einer offenen Regressions-Grenze.
      return { kind: "recovery", km: 6 + Math.round(rand() * 2), hr: 127 };
    case 7:
      // Lange Läufe wachsen über den Block, mit Entlastungswochen alle 4.
      return {
        kind: "long",
        km: weekIndex % 4 === 3 ? 14 : 16 + Math.min(8, Math.floor(weekIndex / 2)),
        hr: 148,
      };
    default:
      return null;
  }
}

/**
 * Pace-Modell: Pace (s/km) fällt linear mit der Herzfrequenz. Das macht die
 * Läufe untereinander konsistent — und genau daraus leitet
 * lib/endurance/zone-estimation.ts später seine Regression ab.
 */
function paceForHr(hr: number): number {
  return 690 - 2.4 * hr;
}

function buildSteadyLaps(km: number, hr: number, rand: () => number): RunLap[] {
  const laps: RunLap[] = [];
  const fullKm = Math.floor(km);
  const rest = km - fullKm;
  const base = paceForHr(hr);

  for (let i = 0; i < fullKm; i++) {
    // Erste Kilometer bewusst langsamer (Einlaufen) — die Zonen-Schätzung
    // wirft den ersten Lap ohnehin weg.
    const warmup = i === 0 ? 18 : i === 1 ? 7 : 0;
    // Kardialer Drift, aber gedeckelt: sonst läuft ein 24-km-Lauf im Schnitt
    // in Zone 3 statt Zone 2 und die Zonen-Schätzung bekommt falsche Anker.
    const drift = Math.min(6, i * 0.5);
    const noise = (rand() - 0.5) * 8;
    const pace = round(base + warmup + noise - drift * 0.2, 0);
    const lapHr = Math.round(clamp(hr - (i === 0 ? 9 : 0) + drift + (rand() - 0.5) * 4, 95, 205));
    laps.push({
      distanceMeters: 1000,
      durationSec: pace,
      avgPaceSecPerKm: pace,
      avgHr: lapHr,
    });
  }

  if (rest > 0.15) {
    const pace = round(base + (rand() - 0.5) * 8, 0);
    laps.push({
      distanceMeters: round(rest * 1000, 0),
      durationSec: round(pace * rest, 0),
      avgPaceSecPerKm: pace,
      avgHr: Math.round(hr + 2),
    });
  }

  return laps;
}

function buildIntervalLaps(rand: () => number): RunLap[] {
  const laps: RunLap[] = [];
  // 2 km einlaufen
  laps.push({ distanceMeters: 2000, durationSec: 750, avgPaceSecPerKm: 375, avgHr: 132 });
  // 6 × 1000 m @ ~4:15 mit 400 m Trabpause
  for (let i = 0; i < 6; i++) {
    const pace = round(255 + i * 2 + (rand() - 0.5) * 6, 0);
    laps.push({
      distanceMeters: 1000,
      durationSec: pace,
      avgPaceSecPerKm: pace,
      avgHr: Math.round(clamp(168 + i * 1.5 + (rand() - 0.5) * 3, 95, 205)),
    });
    laps.push({ distanceMeters: 400, durationSec: 170, avgPaceSecPerKm: 425, avgHr: 142 });
  }
  // 1,4 km auslaufen
  laps.push({ distanceMeters: 1400, durationSec: 540, avgPaceSecPerKm: 386, avgHr: 134 });
  return laps;
}

// ------------------------------------------------------------ Trainingsplan ---

const PLAN_PHASE_BY_WEEK: ("base" | "build" | "peak" | "taper" | "race")[] = [
  "base", "base", "base", "base",
  "build", "build", "build", "build", "build",
  "peak", "peak", "peak",
  "taper", "taper", "taper",
  "race",
];

type PlanSlot = {
  weekday: number;
  sessionType: DemoPlanSession["sessionType"];
  title: string;
  km: number;
  zone: number;
};

function planSlotsForWeek(weekNumber: number): PlanSlot[] {
  const phase = PLAN_PHASE_BY_WEEK[weekNumber - 1];
  const deload = weekNumber % 4 === 0;
  const longKm = phase === "taper" ? 16 : phase === "race" ? 42.2 : deload ? 16 : 20 + weekNumber;

  const quality: PlanSlot =
    weekNumber % 2 === 0
      ? { weekday: 4, sessionType: "vo2max", title: "6 × 1000 m Intervalle", km: 11, zone: 5 }
      : { weekday: 4, sessionType: "threshold", title: "Tempodauerlauf", km: 12, zone: 4 };

  if (phase === "race") {
    return [
      { weekday: 2, sessionType: "easy", title: "Lockerer Dauerlauf", km: 6, zone: 2 },
      { weekday: 4, sessionType: "tempo", title: "Einlaufen + 3 × 1 km MP", km: 7, zone: 3 },
      { weekday: 7, sessionType: "long", title: "Marathon", km: 42.2, zone: 3 },
    ];
  }

  return [
    { weekday: 2, sessionType: "easy", title: "Lockerer Dauerlauf", km: 9, zone: 2 },
    quality,
    { weekday: 6, sessionType: "recovery", title: "Regenerationslauf", km: 7, zone: 1 },
    {
      weekday: 7,
      sessionType: "long",
      title: phase === "peak" ? "Langer Lauf mit MP-Anteil" : "Langer Lauf",
      km: Math.round(longKm * 10) / 10,
      zone: phase === "peak" ? 3 : 2,
    },
  ];
}

function blocksForSlot(slot: PlanSlot, zonePace: Record<number, number>): DemoPlanBlock[] {
  const pace = zonePace[slot.zone] ?? 330;

  if (slot.sessionType === "vo2max") {
    return [
      {
        blockOrder: 1,
        repetitions: 1,
        description: "Einlaufen",
        segments: [{ kind: "warmup", distanceMeters: 2000, zone: 1, description: "locker einlaufen" }],
      },
      {
        blockOrder: 2,
        repetitions: 6,
        description: "6 × 1000 m",
        segments: [
          { kind: "work", distanceMeters: 1000, zone: 5, description: "1 km @ 5-km-Tempo" },
          { kind: "recovery", durationSec: 180, zone: 1, description: "Trabpause" },
        ],
      },
      {
        blockOrder: 3,
        repetitions: 1,
        description: "Auslaufen",
        segments: [{ kind: "cooldown", distanceMeters: 1500, zone: 1 }],
      },
    ];
  }

  if (slot.sessionType === "threshold") {
    return [
      {
        blockOrder: 1,
        repetitions: 1,
        description: "Einlaufen",
        segments: [{ kind: "warmup", distanceMeters: 3000, zone: 2 }],
      },
      {
        blockOrder: 2,
        repetitions: 3,
        description: "3 × 12 min Schwelle",
        segments: [
          { kind: "work", durationSec: 720, zone: 4, description: "Schwellentempo" },
          { kind: "recovery", durationSec: 180, zone: 1, description: "Trabpause" },
        ],
      },
      {
        blockOrder: 3,
        repetitions: 1,
        description: "Auslaufen",
        segments: [{ kind: "cooldown", distanceMeters: 2000, zone: 1 }],
      },
    ];
  }

  if (slot.sessionType === "long" && slot.zone === 3) {
    return [
      {
        blockOrder: 1,
        repetitions: 1,
        description: "Grundlage",
        segments: [{ kind: "work", distanceMeters: (slot.km - 8) * 1000, zone: 2 }],
      },
      {
        blockOrder: 2,
        repetitions: 2,
        description: "2 × 4 km Marathontempo",
        segments: [
          { kind: "work", distanceMeters: 4000, zone: 3, description: "Marathontempo" },
          { kind: "recovery", durationSec: 240, zone: 1 },
        ],
      },
    ];
  }

  return [
    {
      blockOrder: 1,
      repetitions: 1,
      description: null,
      segments: [
        {
          kind: "work",
          distanceMeters: slot.km * 1000,
          durationSec: Math.round(slot.km * pace),
          zone: slot.zone,
        },
      ],
    },
  ];
}

// =========================================================== Hauptfunktion ===

export function buildDemoDataset(todayIso: string) {
  const rand = makeRandom(20260802);
  const phases = buildPhaseSpecs();

  // ---- Gewicht ------------------------------------------------------------
  const weightEntries: { date: string; weightKg: number; source: "manual"; notes: string | null }[] = [];
  for (let i = WEIGHT_DAYS; i >= 0; i--) {
    const date = addDays(todayIso, -i);
    // ~5 % Lücken — echte Waagen-Daten sind auch nicht lückenlos.
    if (rand() < 0.05 && i !== 0) continue;
    const base = trueWeightFor(-i, phases);
    const noise = (rand() - 0.5) * 0.9;
    const weekendBump = isoWeekday(date) === 7 ? 0.35 : 0;
    weightEntries.push({
      date,
      weightKg: round(base + noise + weekendBump, 1),
      source: "manual",
      notes: null,
    });
  }

  const weightPhases = phases.map((p) => ({
    kind: p.kind,
    label: p.label,
    startDate: addDays(todayIso, p.fromDay),
    endDate: p.toDay === null ? null : addDays(todayIso, p.toDay),
    source: "manual" as const,
  }));

  // ---- Tages-Tags ---------------------------------------------------------
  const dailyTags: {
    date: string;
    cheatDay: boolean;
    alcohol: boolean;
    cheatMeal: boolean;
    kcalTarget: number | null;
    notes: string | null;
  }[] = [];
  for (let i = NUTRITION_DAYS; i >= 0; i--) {
    const date = addDays(todayIso, -i);
    const wd = isoWeekday(date);
    const isSaturday = wd === 6;
    const isFriday = wd === 5;
    const cheatDay = isSaturday && rand() < 0.3;
    const alcohol = (isFriday || isSaturday) && rand() < 0.28;
    const cheatMeal = !cheatDay && wd === 3 && rand() < 0.12;
    if (!cheatDay && !alcohol && !cheatMeal) continue;
    dailyTags.push({
      date,
      cheatDay,
      alcohol,
      cheatMeal,
      kcalTarget: cheatDay ? 3200 : null,
      notes: cheatDay ? "Geburtstag / Essen gehen" : null,
    });
  }

  // ---- Ernährung + Tagesverbrauch -----------------------------------------
  const nutritionEntries: {
    date: string;
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
  }[] = [];
  const dailyActivity: {
    date: string;
    totalKcal: number;
    activeKcal: number;
    bmrKcal: number;
    steps: number;
  }[] = [];

  const tagByDate = new Map(dailyTags.map((t) => [t.date, t]));

  for (let i = NUTRITION_DAYS; i >= 0; i--) {
    const date = addDays(todayIso, -i);
    const wd = isoWeekday(date);
    const tag = tagByDate.get(date);
    // Diät-Ziel ~2250 kcal, Wochenende etwas höher, Cheat-Days deutlich.
    let kcal = 2250 + (wd >= 6 ? 180 : 0) + (rand() - 0.5) * 260;
    if (tag?.cheatDay) kcal = 3150 + (rand() - 0.5) * 300;
    else if (tag?.cheatMeal) kcal += 480;

    const protein = 155 + (rand() - 0.5) * 25;
    const fat = 68 + (rand() - 0.5) * 16;
    const carbs = Math.max(120, (kcal - protein * 4 - fat * 9) / 4);

    // ~6 % ungetrackte Tage
    if (rand() > 0.06 || i === 0) {
      nutritionEntries.push({
        date,
        caloriesKcal: Math.round(kcal),
        proteinG: round(protein, 1),
        carbsG: round(carbs, 1),
        fatG: round(fat, 1),
        fiberG: round(26 + (rand() - 0.5) * 8, 1),
        sugarG: round(58 + (rand() - 0.5) * 24, 1),
      });
    }

    const runDay = [2, 4, 6, 7].includes(wd);
    const gymDay = Boolean(GYM_SCHEDULE[wd]);
    // Wochenschnitt landet bei ~2 780 kcal. Das muss zur Gewichtskurve passen:
    // bei ~2 300 kcal Intake und −0,45 kg/Woche erwartet die TDEE-Schätzung
    // auf /weight genau diese Größenordnung — ein zu niedriger Garmin-Wert
    // würde der eigenen Maintenance-Rechnung der App widersprechen.
    const bmr = 1900 + Math.round((rand() - 0.5) * 50);
    const active = Math.round(
      (runDay ? 1000 : 420) + (gymDay ? 300 : 0) + (rand() - 0.5) * 200,
    );
    dailyActivity.push({
      date,
      totalKcal: bmr + active,
      activeKcal: active,
      bmrKcal: bmr,
      steps: Math.round((runDay ? 13500 : 8600) + (rand() - 0.5) * 3200),
    });
  }

  // ---- Läufe --------------------------------------------------------------
  const runSessions: {
    date: string;
    startTime: string;
    activityType: string;
    distanceMeters: number;
    durationSeconds: number;
    avgPaceSecPerKm: number;
    avgHeartRate: number;
    maxHeartRate: number;
    elevationGainMeters: number;
    caloriesKcal: number;
    aerobicTrainingEffect: number;
    anaerobicTrainingEffect: number;
    trainingLoad: number;
    vo2MaxRun: number;
    lapsJson: RunLap[];
    garminActivityId: number;
  }[] = [];

  let activityId = 900000000;
  for (let i = RUN_DAYS; i >= 0; i--) {
    const date = addDays(todayIso, -i);
    if (date > todayIso) continue;
    const weekIndex = Math.floor((RUN_DAYS - i) / 7);
    const plan = runPlanFor(isoWeekday(date), weekIndex, rand);
    if (!plan) continue;
    // ~7 % ausgefallene Einheiten (krank, Zeitmangel) — sonst wirkt es
    // künstlich. Die laufende Woche bleibt aber vollständig, sonst zeigt die
    // "This Week"-Card auf der Startseite Lücken statt Trainings.
    if (i > 8 && rand() < 0.07) continue;

    const laps = plan.kind === "intervals" ? buildIntervalLaps(rand) : buildSteadyLaps(plan.km, plan.hr, rand);
    const distance = laps.reduce((sum, l) => sum + l.distanceMeters, 0);
    const duration = laps.reduce((sum, l) => sum + l.durationSec, 0);
    const avgHr = Math.round(
      laps.reduce((sum, l) => sum + (l.avgHr ?? 0) * l.durationSec, 0) / duration,
    );
    const hard = plan.kind === "intervals" || plan.kind === "tempo";

    runSessions.push({
      date,
      startTime: localStamp(date, isoWeekday(date) >= 6 ? 9 : 18, 15 + Math.round(rand() * 20)),
      activityType: "running",
      distanceMeters: round(distance, 0),
      durationSeconds: round(duration, 0),
      avgPaceSecPerKm: round((duration / distance) * 1000, 1),
      avgHeartRate: avgHr,
      maxHeartRate: Math.round(avgHr + (hard ? 18 : 11) + rand() * 4),
      elevationGainMeters: round(distance / 1000 * (6 + rand() * 9), 0),
      caloriesKcal: round((distance / 1000) * 68, 0),
      aerobicTrainingEffect: round(hard ? 3.6 + rand() * 0.7 : 2.4 + rand() * 0.8, 1),
      anaerobicTrainingEffect: round(plan.kind === "intervals" ? 1.8 + rand() * 0.8 : rand() * 0.5, 1),
      trainingLoad: round(hard ? 190 + rand() * 60 : 95 + (distance / 1000) * 6, 0),
      vo2MaxRun: round(48 + ((RUN_DAYS - i) / RUN_DAYS) * 3, 0),
      lapsJson: laps,
      garminActivityId: activityId++,
    });
  }

  // ---- Garmin-Tagesmetriken ----------------------------------------------
  const rhrSeries: number[] = [];
  const dailyMetrics: {
    date: string;
    restingHeartRate: number;
    restingHeartRate7dAvg: number;
    hrvLastNight: number;
    hrvStatus: string;
    hrvBaselineLowUpper: number;
    hrvBaselineBalancedLow: number;
    hrvBaselineBalancedUpper: number;
    hrvBaselineMarker: number;
    sleepScore: number;
    sleepDurationSec: number;
    deepSleepSec: number;
    lightSleepSec: number;
    remSleepSec: number;
    awakeSleepSec: number;
    sleepStartLocal: string;
    sleepEndLocal: string;
    sleepQuality: string;
    vo2MaxRunning: number;
    lactateThresholdHr: number;
    lactateThresholdPaceSecPerKm: number;
    trainingStatus: string;
    racePrediction5k: number;
    racePrediction10k: number;
    racePredictionHalfMarathon: number;
    racePredictionMarathon: number;
    rawJson: string;
  }[] = [];

  for (let i = METRICS_DAYS; i >= 0; i--) {
    const date = addDays(todayIso, -i);
    const progress = (METRICS_DAYS - i) / METRICS_DAYS;
    const tag = tagByDate.get(date);
    // Alkohol am Vorabend drückt HRV und hebt den Ruhepuls — dieselbe
    // Kopplung, die der Sleep-Chart im Metrics-Dashboard sichtbar macht.
    const prevTag = tagByDate.get(addDays(date, -1));
    const hangover = prevTag?.alcohol || tag?.alcohol ? 1 : 0;

    const rhr = Math.round(clamp(53 - progress * 3 + hangover * 4 + (rand() - 0.5) * 3, 44, 62));
    rhrSeries.push(rhr);
    const window = rhrSeries.slice(-7);
    const rhr7 = Math.round(window.reduce((a, b) => a + b, 0) / window.length);

    const hrv = Math.round(clamp(64 + progress * 5 - hangover * 12 + (rand() - 0.5) * 9, 34, 96));
    const hrvStatus = hrv < 54 ? "UNBALANCED" : hrv > 78 ? "BALANCED" : "BALANCED";

    const deep = Math.round((52 + rand() * 32) * 60);
    const rem = Math.round((78 + rand() * 34) * 60);
    const awake = Math.round((11 + rand() * 14 + hangover * 9) * 60);
    const light = Math.round((196 + rand() * 40 - hangover * 22) * 60);
    const total = deep + rem + light + awake;
    const bedHour = 22 + (rand() < 0.55 ? 0 : 1);
    const bedMin = Math.round(rand() * 55);
    const sleepStart = localStamp(addDays(date, -1), bedHour, bedMin);
    const endMinutes = bedHour * 60 + bedMin + Math.round(total / 60);
    const sleepEnd = localStamp(date, Math.floor(endMinutes / 60) % 24, endMinutes % 60);
    const score = Math.round(clamp(84 + (deep / 60 - 66) * 0.25 - hangover * 13 + (rand() - 0.5) * 8, 42, 96));

    const vo2 = round(48 + progress * 3, 0);
    const marathonPred = Math.round(13800 - progress * 700);

    dailyMetrics.push({
      date,
      restingHeartRate: rhr,
      restingHeartRate7dAvg: rhr7,
      hrvLastNight: hrv,
      hrvStatus,
      hrvBaselineLowUpper: 54,
      hrvBaselineBalancedLow: 54,
      hrvBaselineBalancedUpper: 79,
      hrvBaselineMarker: 66,
      sleepScore: score,
      sleepDurationSec: total,
      deepSleepSec: deep,
      lightSleepSec: light,
      remSleepSec: rem,
      awakeSleepSec: awake,
      sleepStartLocal: sleepStart,
      sleepEndLocal: sleepEnd,
      sleepQuality: score >= 85 ? "EXCELLENT" : score >= 70 ? "GOOD" : "FAIR",
      vo2MaxRunning: vo2,
      lactateThresholdHr: 168,
      lactateThresholdPaceSecPerKm: round(292 - progress * 8, 0),
      trainingStatus: i < 10 ? "PRODUCTIVE" : i < 40 ? "MAINTAINING" : "PRODUCTIVE",
      racePrediction5k: Math.round(1425 - progress * 70),
      racePrediction10k: Math.round(2970 - progress * 150),
      racePredictionHalfMarathon: Math.round(6570 - progress * 330),
      racePredictionMarathon: marathonPred,
      rawJson: JSON.stringify({
        trainingStatus: {
          latestTrainingStatusData: {
            demo: {
              trainingStatusFeedbackPhrase: "PRODUCTIVE_1",
              fitnessTrend: 1,
              weeklyTrainingLoad: Math.round(620 + progress * 180),
              loadLevelTrend: "OPTIMAL",
              acuteTrainingLoadDTO: {
                dailyTrainingLoadAcute: Math.round(340 + progress * 90),
                acwrPercent: Math.round(104 + (rand() - 0.5) * 16),
                acwrStatus: "OPTIMAL",
              },
            },
          },
        },
      }),
    });
  }

  // ---- Krafttraining ------------------------------------------------------
  const workoutSessions: { templateSlug: string; date: string; notes: string | null }[] = [];
  const workoutSets: DemoWorkoutSet[] = [];
  const sessionOverrides: { templateSlug: string; date: string; exerciseSlug: string; name: string }[] = [];

  const gymDays = GYM_WEEKS * 7;
  for (let i = gymDays; i >= 0; i--) {
    const date = addDays(todayIso, -i);
    if (date > todayIso) continue;
    const templateSlug = GYM_SCHEDULE[isoWeekday(date)];
    if (!templateSlug) continue;
    // Ausgefallene Einheit — die letzten Tage bleiben komplett, damit der
    // Volumen-Avatar (7-Tage-Fenster) alle Muskelgruppen zeigt.
    if (i > 8 && rand() < 0.07) continue;

    const template = TEMPLATES.find((t) => t.slug === templateSlug);
    if (!template) continue;

    const progress = (gymDays - i) / gymDays;
    workoutSessions.push({
      templateSlug,
      date,
      notes: rand() < 0.18 ? "Gut gelaufen, Griffkraft war das Limit." : null,
    });

    for (const slot of template.exercises) {
      // Progression in echten Hantel-Schritten statt krummer Zwischenwerte.
      const target = slot.startKg + (slot.endKg - slot.startKg) * progress;
      const weight = round(Math.round(target / slot.step) * slot.step, 2);
      const ex = EXERCISES.find((e) => e.slug === slot.slug);
      const repTop = ex?.defaultRepMax ?? 12;
      const repLow = ex?.defaultRepMin ?? 8;

      for (let s = 1; s <= slot.defaultSets; s++) {
        // Über die Sätze fällt die Wiederholungszahl leicht ab.
        const reps = Math.max(repLow - 1, Math.round(repTop - (s - 1) * 1.1 - rand() * 1.2));
        workoutSets.push({
          templateSlug,
          date,
          exerciseSlug: slot.slug,
          setNumber: s,
          weightKg: weight,
          reps,
          weightMode: slot.weightMode,
        });
      }
    }

    // Gelegentlich war ein Gerät besetzt → Ersatzübung für diesen Slot.
    if (i < 30 && rand() < 0.18) {
      const swap =
        templateSlug === "push"
          ? { exerciseSlug: "bankdruecken", name: "Bankdrücken an der Multipresse" }
          : templateSlug === "pull"
            ? { exerciseSlug: "latzug", name: "Klimmzüge (assistiert)" }
            : { exerciseSlug: "beinpresse", name: "Hackenschmidt-Kniebeuge" };
      sessionOverrides.push({ templateSlug, date, ...swap });
    }
  }

  // ---- Trainingsplan ------------------------------------------------------
  const planStartDate = addDays(mondayOf(todayIso), -PLAN_WEEKS_ELAPSED * 7);
  const raceDate = addDays(planStartDate, PLAN_TOTAL_WEEKS * 7 - 1);

  const paceZones = {
    z1: { minSec: 372, maxSec: 420 },
    z2: { minSec: 336, maxSec: 372 },
    z3: { minSec: 306, maxSec: 336 },
    z4: { minSec: 284, maxSec: 306 },
    z5: { minSec: 252, maxSec: 284 },
  };
  const zonePace: Record<number, number> = {
    1: 396,
    2: 354,
    3: 321,
    4: 295,
    5: 268,
  };

  const planWeeks = Array.from({ length: PLAN_TOTAL_WEEKS }, (_, idx) => {
    const weekNumber = idx + 1;
    const startDate = addDays(planStartDate, idx * 7);
    const slots = planSlotsForWeek(weekNumber);
    return {
      weekNumber,
      startDate,
      endDate: addDays(startDate, 6),
      phase: PLAN_PHASE_BY_WEEK[idx],
      targetVolumeKm: round(slots.reduce((sum, s) => sum + s.km, 0), 1),
      notes: null as string | null,
    };
  });

  const planSessions: DemoPlanSession[] = [];
  for (const week of planWeeks) {
    for (const slot of planSlotsForWeek(week.weekNumber)) {
      const date = addDays(week.startDate, slot.weekday - 1);
      const past = date < todayIso;
      planSessions.push({
        weekNumber: week.weekNumber,
        date,
        dayOrder: 1,
        sessionType: slot.sessionType,
        title: slot.title,
        description:
          slot.sessionType === "long"
            ? "Gleichmäßig laufen, letzte 20 Minuten leicht anziehen."
            : slot.sessionType === "recovery"
              ? "Bewusst langsam — die Einheit dient der Erholung."
              : null,
        targetDurationSec: Math.round(slot.km * (zonePace[slot.zone] ?? 330)),
        targetDistanceMeters: Math.round(slot.km * 1000),
        primaryZone: slot.zone,
        // Vergangene Einheiten sind erledigt, mit ein paar realistischen Ausfällen.
        status: past ? (rand() < 0.1 ? "skipped" : "completed") : "planned",
        blocks: blocksForSlot(slot, zonePace),
      });
    }
  }

  const nextSession = planSessions.find((s) => s.date >= todayIso && s.status === "planned");

  const trainingPlan = {
    name: "Marathon-Vorbereitung",
    goalType: "race" as const,
    raceName: "Berlin-Marathon",
    raceDate,
    raceDistanceKm: 42.195,
    targetTimeSeconds: 13500, // 3:45:00
    targetPaceSecPerKm: round(13500 / 42.195, 1),
    targetWeeklyKmPeak: 62,
    sessionsPerWeek: 4,
    planStartDate,
    totalWeeks: PLAN_TOTAL_WEEKS,
    status: "active" as const,
    paceZonesJson: paceZones,
    notes: "Beispielplan der Demo — 16 Wochen, vier Läufe pro Woche.",
    nextNoteText: nextSession
      ? "HRV liegt im Normbereich und der Ruhepuls ist stabil — die Einheit kann wie geplant laufen. Achte auf den Einlaufteil, die letzten beiden Tage waren beide Belastungstage."
      : null,
    nextNoteForDate: nextSession?.date ?? null,
  };

  // ---- KI-Tagesübersicht (vorgeneriert, spart einen Modell-Aufruf) --------
  const dashboardOverview = {
    date: todayIso,
    enduranceText:
      "Die Woche liegt bei rund 45 km — im Rahmen des Plans. Der lange Lauf am Sonntag war gleichmäßig, die Herzfrequenz blieb im geplanten Korridor. VO₂max steht bei 51, die Marathon-Prognose bei 3:38 h und damit vor dem Zielwert.",
    hypertrophyText:
      "Drei Einheiten in den letzten sieben Tagen, alle Muskelgruppen abgedeckt. Beim Bankdrücken stehen 77,5 kg — vier Wochen zuvor waren es 72,5 kg. Die Beinsession liegt bewusst am Freitag, damit der lange Lauf am Sonntag frische Beine bekommt.",
    weightText:
      "Der Trend zeigt −0,4 kg pro Woche und liegt damit exakt im Zielkorridor der Diätphase. Die Kalorienaufnahme lag im Wochenschnitt bei etwa 2 320 kcal. Der Ausschlag am Samstag ist ein Cheat-Day und kein echter Rückschritt.",
    model: "demo-seed",
  };

  return {
    todayIso,
    exercises: EXERCISES,
    templates: TEMPLATES,
    weightEntries,
    weightPhases,
    dailyTags,
    nutritionEntries,
    dailyActivity,
    runSessions,
    dailyMetrics,
    workoutSessions,
    workoutSets,
    sessionOverrides,
    trainingPlan,
    planWeeks,
    planSessions,
    dashboardOverview,
  };
}
