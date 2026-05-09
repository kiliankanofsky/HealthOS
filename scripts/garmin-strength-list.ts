import { config } from "dotenv";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";

// Listet die letzten N Strength-Trainings inkl. Sätzen auf.
// Schreibt nichts in die DB. Nur zum Erkunden des Datenformats.
//
// Aufruf:   npm run garmin:strength-list
// Optional: npm run garmin:strength-list -- --limit=10

config({ path: ".env.local" });
config();

type ExerciseSet = {
  setType: string; // "ACTIVE" | "REST"
  startTime: string;
  duration: number; // Sekunden
  repetitionCount?: number | null;
  weight?: number | null; // Garmin liefert in **Gramm**
  exercises?: Array<{
    category: string; // z.B. "BENCH_PRESS"
    name?: string | null; // detaillierte Übung, z.B. "INCLINE_DUMBBELL_BENCH_PRESS"
  }>;
};

type ExerciseSetsResponse = {
  exerciseSets: ExerciseSet[];
};

function parseLimit(): number {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return 30;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

function isRawDump(): boolean {
  return process.argv.includes("--raw");
}

async function main() {
  const limit = parseLimit();
  console.log(`Lade die letzten ${limit} Strength-Trainings...`);
  const client = await getGarminClient();

  // Library-Enum kennt strength_training nicht — clientseitig filtern.
  // 4× so viele laden, damit wir genug Strength-Sessions haben.
  const all = await client.getActivities(0, limit * 4);
  const activities = all.filter(
    (a) => a.activityType?.typeKey === "strength_training",
  );
  console.log(
    `✅ ${activities.length} Strength-Aktivitäten in den letzten ${all.length} gefunden.\n`,
  );

  for (const a of activities) {
    console.log(
      `── ${a.startTimeLocal}  "${a.activityName ?? ""}"  id=${a.activityId}`,
    );

    let detail: ExerciseSetsResponse;
    try {
      detail = await client.client.get<ExerciseSetsResponse>(
        `https://connectapi.garmin.com/activity-service/activity/${a.activityId}/exerciseSets`,
      );
    } catch (err) {
      console.log(`   ⚠️ Sets nicht geladen: ${(err as Error).message}`);
      continue;
    }

    if (isRawDump()) {
      console.log(JSON.stringify(detail, null, 2));
      return;
    }

    const activeSets = (detail.exerciseSets ?? []).filter(
      (s) => s.setType === "ACTIVE",
    );

    if (activeSets.length === 0) {
      console.log(`   (keine Active-Sets)`);
      continue;
    }

    // Pro Übung gruppieren — Garmin sortiert chronologisch.
    let lastCategory = "";
    let setNumber = 0;
    for (const s of activeSets) {
      const ex = s.exercises?.[0];
      const category = ex?.category ?? "?";
      if (category !== lastCategory) {
        console.log(`   ▸ ${category}${ex?.name ? ` (${ex.name})` : ""}`);
        lastCategory = category;
        setNumber = 0;
      }
      setNumber += 1;
      const kg =
        typeof s.weight === "number" ? (s.weight / 1000).toFixed(1) : "—";
      const reps = s.repetitionCount ?? "?";
      console.log(`     Satz ${setNumber}: ${kg} kg × ${reps}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("❌ Fehler:");
  console.error(err);
  process.exit(1);
});
