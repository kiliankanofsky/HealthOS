"use server";

// Server Actions der Startseite (Dashboard).
// maxDuration=60 lebt auf src/app/page.tsx (Page-Level erbt auf Actions) —
// "use server"-Files dürfen nur async Funktionen exportieren.

import { revalidatePath } from "next/cache";

import {
  runDashboardChat,
  type DashboardChatMessage,
} from "@/lib/dashboard/ai-chat";
import type { ChatModel } from "@/lib/endurance/ai-models";
import {
  ensureDailyOverview,
  generateDailyOverview,
} from "@/lib/dashboard/overview";
import { getDashboardOverviewForDate } from "@/lib/db/queries";
import { consumeDemoAiBudget } from "@/lib/demo/ai-budget";
import { todayBerlinISO } from "@/lib/utils/date";

export type OverviewActionState = { ok: boolean; error?: string };

// Tages-Overview generieren. Self-Heal-Fall (force=false): nur wenn der
// heutige Eintrag fehlt. force=true erzwingt eine Neu-Generierung (Button).
export async function generateOverviewAction(
  force = false,
): Promise<OverviewActionState> {
  try {
    const today = todayBerlinISO();

    // Self-Heal ohne fehlenden Eintrag ist ein No-op — erst wenn wirklich
    // generiert wird, kostet das Tokens und zählt aufs Demo-Kontingent.
    const existing = await getDashboardOverviewForDate(today);
    if (existing && !force) {
      return { ok: true };
    }

    const budget = await consumeDemoAiBudget();
    if (!budget.ok) return { ok: false, error: budget.error };

    if (force) {
      await generateDailyOverview(today);
    } else {
      await ensureDailyOverview(today);
    }
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type DashboardChatState = {
  ok: boolean;
  reply?: string;
  error?: string;
};

export async function sendDashboardChatMessage(
  history: DashboardChatMessage[],
  model: ChatModel = "anthropic",
): Promise<DashboardChatState> {
  if (!Array.isArray(history) || history.length === 0) {
    return { ok: false, error: "Keine Nachricht." };
  }
  const budget = await consumeDemoAiBudget();
  if (!budget.ok) return { ok: false, error: budget.error };
  try {
    const { reply } = await runDashboardChat(history, todayBerlinISO(), model);
    return { ok: true, reply };
  } catch (e) {
    return {
      ok: false,
      error: `KI-Chat fehlgeschlagen: ${(e as Error).message}`,
    };
  }
}
