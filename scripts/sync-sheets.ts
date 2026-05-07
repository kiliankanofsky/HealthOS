import { config } from "dotenv";
import { sheetsAdapter } from "../src/lib/integrations/sheets";

// Lädt .env.local (Next.js-Konvention) und fällt auf .env zurück.
config({ path: ".env.local" });
config();

async function main() {
  console.log("Syncing weight data from Google Sheets...");
  const result = await sheetsAdapter.sync();
  console.log(`Done. ${result.inserted} entries upserted.`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
