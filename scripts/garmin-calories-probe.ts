import { config } from "dotenv";

import { getGarminClient } from "../src/lib/integrations/garmin-strength";

config({ path: ".env.local" });
config();

async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const client = await getGarminClient();
  const profile = await client.getUserProfile();
  const displayName = (profile as { displayName?: string }).displayName;
  if (!displayName) throw new Error("Garmin profile.displayName fehlt.");

  const url = `https://connectapi.garmin.com/usersummary-service/usersummary/daily/${displayName}?calendarDate=${date}`;
  console.log(`GET ${url}`);
  const data = await client.get<Record<string, unknown>>(url);

  const interesting = [
    "calendarDate",
    "totalKilocalories",
    "activeKilocalories",
    "bmrKilocalories",
    "wellnessKilocalories",
    "consumedKilocalories",
    "remainingKilocalories",
    "totalSteps",
  ];
  console.log("\nFelder:");
  for (const k of interesting) {
    if (k in data) console.log(`  ${k} = ${JSON.stringify(data[k])}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
