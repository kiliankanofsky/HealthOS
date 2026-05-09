import { GarminConnect } from "@gooin/garmin-connect";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// Garmin-Strength-Adapter: liest Krafttraining-Aktivitäten aus Garmin Connect.
//
// Auth-Flow:
// 1. Erste Anmeldung mit Username + Passwort (aus .env.local).
// 2. Library cached OAuth1- und OAuth2-Token im DATA-Dir.
// 3. Folgende Aufrufe nutzen die Tokens — kein erneutes Passwort-Login,
//    bis OAuth2 abläuft (Garmin refresht es automatisch über OAuth1).

const TOKEN_DIR = path.join(process.cwd(), "data", "garmin");

function ensureTokenDir(): void {
  if (!existsSync(TOKEN_DIR)) {
    mkdirSync(TOKEN_DIR, { recursive: true });
  }
}

function getCredentials(): { username: string; password: string } {
  const username = process.env.GARMIN_USERNAME;
  const password = process.env.GARMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "GARMIN_USERNAME / GARMIN_PASSWORD nicht gesetzt. Lege sie in .env.local an.",
    );
  }
  return { username, password };
}

// Liefert einen authentifizierten Client. Versucht zuerst Token-Restore,
// fällt sonst auf Passwort-Login zurück. Beim Login werden die Tokens
// automatisch wieder gespeichert.
export async function getGarminClient(): Promise<GarminConnect> {
  ensureTokenDir();
  const credentials = getCredentials();
  const client = new GarminConnect(credentials);

  const oauth1Path = path.join(TOKEN_DIR, "oauth1_token.json");
  const oauth2Path = path.join(TOKEN_DIR, "oauth2_token.json");
  const hasTokens = existsSync(oauth1Path) && existsSync(oauth2Path);

  if (hasTokens) {
    try {
      await client.loadTokenByFile(TOKEN_DIR);
      // Smoke-Test: User-Profil laden. Wenn das wirft, sind die Tokens kaputt.
      await client.getUserProfile();
      return client;
    } catch {
      // Token abgelaufen / ungültig — fallthrough zum Passwort-Login.
    }
  }

  await client.login();
  await client.exportTokenToFile(TOKEN_DIR);
  return client;
}
