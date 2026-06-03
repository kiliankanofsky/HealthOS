/**
 * CLI: Trainingsplan-Sessions via KI generieren — ohne Vercel-60s-Limit.
 *
 * Nutzung:
 *   set -a && source .env.local && set +a && \
 *     USE_TURSO=1 npm run db:gen:plan -- --planId=1 [--model=sonnet|opus] [--reset]
 *
 * Flags:
 *   --planId=N      ID des Plans (Pflicht)
 *   --model=NAME    sonnet (default, günstig) oder opus (teurer, beste Qualität)
 *   --reset         Bestehende Sessions+Blocks vorher löschen und Status zurück auf draft
 *
 * Verhalten:
 *   - Idempotent: bereits fertige Chunks werden übersprungen
 *   - Pro Chunk: 1 Claude-Call (kein 60s-Limit lokal), Bulk-Insert in Turso
 *   - Nach letztem Chunk: Plan-Status → "active" + Notes
 *
 * Warum CLI: Vercel-Hobby hat 60s Action-Timeout. Ein Sonnet-Call für einen
 * 2-Wochen-Chunk mit PDF-Kontext kann an dieses Limit kommen. Lokal hat man
 * keinen Timeout — alle Chunks in einem Rutsch.
 */

import {
  deleteAllPlanSessionsForPlan,
  getSessionsForPlan,
  getTrainingPlanById,
  getWeeksForPlan,
  setTrainingPlanStatus,
  updateTrainingPlan,
} from "../src/lib/db/queries";
import {
  type AiModel,
  chunkWeeks,
  generateChunk,
} from "../src/lib/endurance/ai-generator";
import { persistChunkOutput } from "../src/lib/endurance/ai-persist";

// ============================================================
// Args
// ============================================================
function parseArgs(): { planId: number; model: AiModel; reset: boolean } {
  const args = process.argv.slice(2);
  const planIdArg = args.find((a) => a.startsWith("--planId="));
  const modelArg = args.find((a) => a.startsWith("--model="));
  const reset = args.includes("--reset");

  if (!planIdArg) {
    console.error(
      "Usage: tsx scripts/generate-plan.ts --planId=N [--model=sonnet|opus] [--reset]",
    );
    process.exit(2);
  }
  const planId = Number(planIdArg.split("=")[1]);
  if (!Number.isFinite(planId) || planId <= 0) {
    console.error(`Ungültige planId: ${planIdArg}`);
    process.exit(2);
  }
  const modelStr = modelArg?.split("=")[1] ?? "sonnet";
  if (modelStr !== "sonnet" && modelStr !== "opus") {
    console.error(`Ungültiges --model: ${modelStr} (erwartet sonnet|opus)`);
    process.exit(2);
  }
  return { planId, model: modelStr as AiModel, reset };
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY ist nicht gesetzt. Vorher:\n" +
        "  set -a && source .env.local && set +a",
    );
    process.exit(2);
  }
  if (!process.env.USE_TURSO && !process.env.TURSO_DATABASE_URL) {
    console.warn(
      "⚠️  USE_TURSO ist nicht gesetzt — Skript schreibt in LOKALE SQLite-Datei.",
    );
    console.warn(
      "    Für Production-Plan bitte: USE_TURSO=1 npm run db:gen:plan -- ...",
    );
  }

  const { planId, model, reset } = parseArgs();

  const plan = await getTrainingPlanById(planId);
  if (!plan) {
    console.error(`Plan ${planId} nicht gefunden.`);
    process.exit(1);
  }
  console.log(
    `Plan: ${plan.name} (id=${planId}, status=${plan.status}, totalWeeks=${plan.totalWeeks})`,
  );
  console.log(`Modell: ${model === "opus" ? "Opus 4.8" : "Sonnet 4.6"}`);

  if (reset) {
    console.log("--reset: lösche alle Sessions...");
    await deleteAllPlanSessionsForPlan(planId);
    if (plan.status !== "draft") {
      await setTrainingPlanStatus(planId, "draft");
    }
  } else if (plan.status === "active") {
    console.error(
      "Plan ist bereits active. Mit --reset alle Sessions löschen und neu generieren.",
    );
    process.exit(1);
  }

  const weeks = await getWeeksForPlan(planId);
  if (weeks.length === 0) {
    console.error("Plan hat keine Wochen — Setup nicht abgeschlossen.");
    process.exit(1);
  }
  const chunks = chunkWeeks(weeks);
  console.log(`${chunks.length} Chunks zu generieren.\n`);

  let totalSessions = 0;
  let totalAlternatives = 0;
  let totalCacheRead = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunkData = chunks[ci];
    const chunkWeekIds = new Set(chunkData.map((w) => w.id));
    const existing = await getSessionsForPlan(planId);
    const alreadyDone = existing.some((s) => chunkWeekIds.has(s.weekId));

    const range = `Wochen ${chunkData[0].weekNumber}-${chunkData[chunkData.length - 1].weekNumber}`;
    if (alreadyDone) {
      console.log(
        `[${ci + 1}/${chunks.length}] ${range}: schon fertig, skip`,
      );
      totalSkipped++;
      continue;
    }

    process.stdout.write(`[${ci + 1}/${chunks.length}] ${range}: Claude-Call...`);
    const t0 = Date.now();
    let result;
    try {
      result = await generateChunk(plan, chunkData, model);
    } catch (e) {
      console.error(`\n  ✕ Claude-Call fehlgeschlagen: ${(e as Error).message}`);
      process.exit(1);
    }
    const dtCall = ((Date.now() - t0) / 1000).toFixed(1);

    const persisted = await persistChunkOutput({
      planId,
      allWeeks: weeks,
      output: result.output,
    });
    if (!persisted.ok) {
      console.error(`\n  ✕ DB-Mapping fehlgeschlagen: ${persisted.error}`);
      process.exit(1);
    }
    totalSessions += persisted.primarySessions;
    totalAlternatives += persisted.alternativeSessions;
    totalCacheRead += result.usage.cacheReadInputTokens;

    console.log(
      ` ✓ ${persisted.primarySessions} Sessions + ${persisted.alternativeSessions} Alt., ${dtCall}s` +
        (result.usage.cacheReadInputTokens > 0
          ? ` (cacheRead=${result.usage.cacheReadInputTokens})`
          : ""),
    );
  }

  // Finalisierung. Hinweis: nach --reset steht die DB auf "draft", aber die
  // lokal geladene `plan.status`-Variable noch auf dem alten Wert — daher `reset ||`.
  if (reset || plan.status === "draft") {
    await setTrainingPlanStatus(planId, "active");
    await updateTrainingPlan(planId, {
      notes: `KI-generiert (CLI) mit ${model === "opus" ? "Opus 4.8" : "Sonnet 4.6"} am ${new Date().toISOString().slice(0, 10)}.`,
    });
  }

  const totalDt = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDONE in ${totalDt}s`);
  console.log(`  Primary Sessions: +${totalSessions}`);
  console.log(`  Alternativen:     +${totalAlternatives}`);
  console.log(`  Chunks skipped:   ${totalSkipped} (waren schon fertig)`);
  console.log(`  Cache-Read total: ${totalCacheRead.toLocaleString("de-DE")} Tokens`);
  console.log(`  Plan-Status:      active`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
