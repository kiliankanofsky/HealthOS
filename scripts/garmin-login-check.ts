import { config } from "dotenv";
import { getGarminClient } from "../src/lib/integrations/garmin-strength";

// Prüft ob der Garmin-Login funktioniert. Schreibt nichts in die DB.
// Aufruf: npm run garmin:login-check

config({ path: ".env.local" });
config();

async function main() {
  console.log("Verbinde mit Garmin Connect...");
  const client = await getGarminClient();

  const profile = await client.getUserProfile();
  console.log("✅ Login erfolgreich.");
  console.log(`   User:        ${profile.userName ?? profile.displayName ?? "?"}`);
  console.log(`   Profile-ID:  ${profile.id ?? profile.profileId ?? "?"}`);

  // Smoke-Test: ein paar Strength-Activities zählen.
  // ActivityType-Filter brauchen wir später ohnehin.
  const recent = await client.getActivities(0, 5);
  console.log(`✅ Habe ${recent.length} Aktivitäten geladen (egal welcher Typ).`);
  for (const a of recent) {
    console.log(
      `   • ${a.startTimeLocal}  ${a.activityType?.typeKey ?? "?"}  ${a.activityName ?? ""}`,
    );
  }
}

main().catch((err) => {
  console.error("❌ Login fehlgeschlagen:");
  console.error(err);
  process.exit(1);
});
