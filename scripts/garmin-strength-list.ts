import { config } from "dotenv";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";
import { buildExerciseAliasMap } from "../src/lib/db/queries";

config({ path: ".env.local" });
config();

// Listet die letzten N Strength-Trainings inkl. Sätzen auf — und kann ein
// einzelnes Training gezielt diagnostizieren (warum mappt ein Satz nicht?).
// Schreibt nichts in die DB. Nur zum Erkunden / Debuggen des Datenformats.
//
// Aufruf:
//   npm run garmin:strength-list
//   npm run garmin:strength-list -- --limit=10
//   npm run garmin:strength-list -- --raw                       (Roh-JSON 1. Aktivität)
//   npm run garmin:strength-list -- --date=2026-06-08 --diagnose (gezielt, pro-Satz-Mapping)
//   npm run garmin:strength-list -- --activity=12345 --raw       (Roh-JSON gezielt)

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

type Activity = {
  activityId: number;
  activityName?: string | null;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
};

function parseLimit(): number {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return 30;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

function argValue(prefix: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function isRawDump(): boolean {
  return process.argv.includes("--raw");
}

// Spiegelt die Mapping-Logik aus garmin-strength-import.ts wider.
function pickCode(
  exercise: { category?: string | null; name?: string | null } | undefined,
): string | null {
  if (!exercise) return null;
  return exercise.name ?? exercise.category ?? null;
}

async function fetchSets(
  client: Awaited<ReturnType<typeof getGarminClient>>,
  activityId: number,
): Promise<ExerciseSetsResponse> {
  return client.client.get<ExerciseSetsResponse>(
    `https://connectapi.garmin.com/activity-service/activity/${activityId}/exerciseSets`,
  );
}

// Detail-Diagnose eines einzelnen Trainings: zeigt PRO Satz, welchen Code der
// Import picken würde und ob er in der Alias-Map landet. So sieht man sofort,
// warum ein Satz beim Sync verloren ging (kein Code? unbekannter Code? kein
// Gewicht?). Genau das brauchen wir für den Skip-Group-Fehler.
async function diagnose(
  client: Awaited<ReturnType<typeof getGarminClient>>,
  act: Activity,
): Promise<void> {
  console.log(
    `\n=== DIAGNOSE  ${act.startTimeLocal}  "${act.activityName ?? ""}"  id=${act.activityId} ===`,
  );
  const aliasMap = await buildExerciseAliasMap();
  const detail = await fetchSets(client, act.activityId);
  const sets = detail.exerciseSets ?? [];

  console.log(
    `Idx | setType  | category / name                       | code → Mapping            | kg × reps`,
  );
  console.log("-".repeat(110));
  let idx = 0;
  const unmapped = new Set<string>();
  for (const s of sets) {
    idx += 1;
    const ex = s.exercises?.[0];
    const cat = ex?.category ?? "—";
    const name = ex?.name ?? "—";
    const code = pickCode(ex);
    const mappedId = code ? aliasMap.get(code.toLowerCase()) : undefined;
    let mapStr: string;
    if (s.setType !== "ACTIVE") {
      mapStr = "(kein ACTIVE-Satz)";
    } else if (!code) {
      mapStr = "❌ KEIN CODE";
    } else if (mappedId === undefined) {
      mapStr = "❌ UNBEKANNT";
      unmapped.add(code);
    } else {
      mapStr = `✅ exerciseId=${mappedId}`;
    }
    const kg =
      typeof s.weight === "number" ? (s.weight / 1000).toFixed(1) : "—(kein Gewicht)";
    const reps = s.repetitionCount ?? "—";
    const noWeight =
      s.setType === "ACTIVE" && typeof s.weight !== "number"
        ? "  ⚠️ wird vom Import wegen fehlendem Gewicht verworfen"
        : "";
    console.log(
      `${String(idx).padStart(3)} | ${s.setType.padEnd(7)} | ${`${cat} / ${name}`.padEnd(37)} | ${(code ?? "—").padEnd(22)} ${mapStr} | ${kg} × ${reps}${noWeight}`,
    );
  }
  if (unmapped.size > 0) {
    console.log(
      `\n⚠️ Unbekannte Codes (fehlen als Alias an einer Übung): ${[...unmapped].join(", ")}`,
    );
    console.log(
      `   → Diese Codes als Alias zur passenden Übung in der DB ergänzen, dann erneut syncen.`,
    );
  }
}

async function main() {
  const dateFilter = argValue("--date=");
  const activityFilter = argValue("--activity=");
  const limit = parseLimit();

  console.log(`Lade Strength-Trainings...`);
  const client = await getGarminClient();
  const all = (await client.getActivities(0, Math.max(limit * 4, 80))) as Activity[];
  const activities = all.filter(
    (a) => a.activityType?.typeKey === "strength_training",
  );
  console.log(
    `✅ ${activities.length} Strength-Aktivitäten in den letzten ${all.length} gefunden.\n`,
  );

  // Gezielte Diagnose / Raw-Dump eines einzelnen Trainings.
  if (dateFilter || activityFilter) {
    const target = activities.find((a) =>
      activityFilter
        ? String(a.activityId) === activityFilter
        : (a.startTimeLocal ?? "").slice(0, 10) === dateFilter,
    );
    if (!target) {
      console.log(
        `❌ Kein Strength-Training für ${activityFilter ?? dateFilter} gefunden (ggf. --limit erhöhen).`,
      );
      return;
    }
    if (isRawDump()) {
      const detail = await fetchSets(client, target.activityId);
      console.log(JSON.stringify(detail, null, 2));
      return;
    }
    await diagnose(client, target);
    return;
  }

  for (const a of activities.slice(0, limit)) {
    console.log(
      `── ${a.startTimeLocal}  "${a.activityName ?? ""}"  id=${a.activityId}`,
    );

    let detail: ExerciseSetsResponse;
    try {
      detail = await fetchSets(client, a.activityId);
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
