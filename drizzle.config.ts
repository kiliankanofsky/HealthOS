import "dotenv/config";
import type { Config } from "drizzle-kit";

const useTurso = process.env.USE_TURSO === "1";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: useTurso
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      }
    : {
        url: "file:./data/health.db",
      },
} satisfies Config;
