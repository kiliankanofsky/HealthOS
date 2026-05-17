import { GarminConnect } from "@gooin/garmin-connect";
import { getGarminTokens, saveGarminTokens } from "@/lib/db/queries";

// Garmin-Strength-Adapter: liest Krafttraining-Aktivitäten aus Garmin Connect.
//
// Auth-Flow:
// 1. Erste Anmeldung mit Username + Passwort (aus ENV).
// 2. OAuth1- und OAuth2-Token werden in der DB-Tabelle `garmin_tokens` (id=1)
//    abgelegt — auf Vercel gibt es kein persistentes Filesystem.
// 3. Folgende Aufrufe laden die Tokens aus der DB; bei Ablauf wird neu
//    eingeloggt und gespeichert.

function getCredentials(): { username: string; password: string } {
  const username = process.env.GARMIN_USERNAME;
  const password = process.env.GARMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "GARMIN_USERNAME / GARMIN_PASSWORD nicht gesetzt. Lege sie als Env-Var an.",
    );
  }
  return { username, password };
}

// Liefert einen authentifizierten Client. Versucht zuerst Token-Restore aus DB,
// fällt sonst auf Passwort-Login zurück. Beim Login werden die neuen Tokens
// in der DB persistiert.
export async function getGarminClient(): Promise<GarminConnect> {
  const credentials = getCredentials();
  const client = new GarminConnect(credentials);

  const stored = await getGarminTokens();
  if (stored) {
    try {
      client.loadToken(
        JSON.parse(stored.oauth1Json),
        JSON.parse(stored.oauth2Json),
      );
      // Smoke-Test: User-Profil laden. Wenn das wirft, sind die Tokens kaputt.
      await client.getUserProfile();
      return client;
    } catch {
      // Token abgelaufen / ungültig — fallthrough zum Passwort-Login.
    }
  }

  await client.login();
  const tokens = client.exportToken();
  await saveGarminTokens(
    JSON.stringify(tokens.oauth1),
    JSON.stringify(tokens.oauth2),
  );
  return client;
}
