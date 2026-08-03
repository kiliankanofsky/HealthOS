import { isDemoRequest } from "@/lib/demo/config";

import { SyncNowButton } from "./SyncNowButton";

// Server-seitiger Platzhalter für den Sync-Button: im Demo-Modus gibt es
// keine Garmin-/FDDB-/Sheets-Zugangsdaten, deshalb wird der Button dort
// erst gar nicht gerendert (die Action blockt zusätzlich, siehe
// app/weight/actions.ts).
export async function SyncNowSlot({ label }: { label?: string } = {}) {
  if (await isDemoRequest()) return null;
  return <SyncNowButton label={label} />;
}
