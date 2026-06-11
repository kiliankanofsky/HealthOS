import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { db } from "./db";
import { user } from "./db/auth-schema";

// Die Health-Daten sind NICHT pro Nutzer getrennt — jeder eingeloggte Account
// sähe alles. Deshalb: nur EIN Konto erlaubt, danach ist die Registrierung zu.
export async function hasAnyUser(): Promise<boolean> {
  const [existing] = await db.select({ id: user.id }).from(user).limit(1);
  return existing !== undefined;
}

// Server-seitige Auth-Instanz (Better Auth). Liest BETTER_AUTH_SECRET und
// BETTER_AUTH_URL aus dem Env. Tabellen: user/session/account/verification
// (in db/schema.ts, generiert via `npx @better-auth/cli generate`).
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          if (await hasAnyUser()) {
            throw new APIError("FORBIDDEN", {
              message:
                "Registrierung ist deaktiviert — es existiert bereits ein Konto.",
            });
          }
        },
      },
    },
  },
  session: {
    // Signierter Session-Cookie-Cache: erspart dem Proxy den DB-Roundtrip
    // bei jeder Navigation, bleibt aber fälschungssicher (HMAC mit Secret).
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // nextCookies muss letztes Plugin sein: setzt Cookies auch aus Server
  // Actions korrekt.
  plugins: [nextCookies()],
});
