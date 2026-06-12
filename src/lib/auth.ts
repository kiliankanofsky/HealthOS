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

// Vercel-Preview-Deployments laufen unter wechselnden *.vercel.app-Domains,
// BETTER_AUTH_URL zeigt aber fest auf die Produktions-URL. Ohne Korrektur
// schlägt der Login dort fehl: Better Auth prüft den Origin des Sign-in-POSTs
// gegen baseURL/trustedOrigins und lehnt die Preview-Domain als fremd ab.
// Auf Preview nehmen wir deshalb die Deployment-URL als Basis und vertrauen
// zusätzlich der Branch-Alias-URL (health-os-git-<branch>-….vercel.app).
const isPreview = process.env.VERCEL_ENV === "preview";
const previewBaseUrl =
  isPreview && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;
const previewTrustedOrigins = isPreview
  ? [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
      .filter((host): host is string => Boolean(host))
      .map((host) => `https://${host}`)
  : [];

// Server-seitige Auth-Instanz (Better Auth). Liest BETTER_AUTH_SECRET und
// BETTER_AUTH_URL aus dem Env. Tabellen: user/session/account/verification
// (in db/schema.ts, generiert via `npx @better-auth/cli generate`).
export const auth = betterAuth({
  ...(previewBaseUrl
    ? { baseURL: previewBaseUrl, trustedOrigins: previewTrustedOrigins }
    : {}),
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
