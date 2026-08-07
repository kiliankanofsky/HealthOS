// One-command setup for a fresh clone:
//
//   npm run setup
//
// 1. Creates .env.local from .env.example with a generated BETTER_AUTH_SECRET
//    (everything else stays empty — the app runs fine without external accounts).
// 2. Applies the Drizzle migrations to the local SQLite file (data/health.db).
// 3. Seeds exercise + workout-template master data into that database.
// 4. Builds the separate demo database (data/demo.db) with generated sample
//    data, so the app has something to show without any real accounts.
//
// Idempotent — running it again is safe.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function step(n: number, title: string): void {
  console.log(`\n\x1b[1m[${n}/4] ${title}\x1b[0m`);
}

function run(script: string): void {
  const result = spawnSync(NPM, ["run", script], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`\`npm run ${script}\` failed with exit code ${result.status}`);
  }
}

// A local dev secret is enough here — production deployments set their own
// BETTER_AUTH_SECRET as an environment variable.
function ensureEnvFile(): void {
  const target = path.join(ROOT, ".env.local");
  if (existsSync(target)) {
    console.log(".env.local already exists — left untouched.");
    return;
  }

  const example = path.join(ROOT, ".env.example");
  if (!existsSync(example)) {
    throw new Error(".env.example is missing — cannot create .env.local.");
  }

  const secret = randomBytes(32).toString("base64");
  const content = readFileSync(example, "utf8").replace(
    /^BETTER_AUTH_SECRET=.*$/m,
    `BETTER_AUTH_SECRET=${secret}`,
  );
  writeFileSync(target, content, "utf8");
  console.log("Created .env.local with a generated BETTER_AUTH_SECRET.");
}

async function main(): Promise<void> {
  step(1, "Environment");
  ensureEnvFile();

  step(2, "Database migrations");
  run("db:migrate");

  step(3, "Exercise and workout-template master data");
  run("db:seed:hypertrophy");

  step(4, "Demo database with generated sample data");
  run("db:seed:demo");

  console.log(
    [
      "",
      "\x1b[1mSetup complete.\x1b[0m",
      "",
      "  npm run dev     →  http://localhost:3000",
      "",
      "You will land on the sign-in page. Two ways in:",
      "",
      "  • \x1b[1mBrowse the demo\x1b[0m — click “Demo mit Beispieldaten starten”.",
      "    Opens the full app backed by the separate demo database.",
      "",
      "  • \x1b[1mUse it for real\x1b[0m — register an account (only one is allowed),",
      "    then add your own data or configure the sync integrations",
      "    in .env.local. See README.md → Data sources.",
      "",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`\nSetup failed: ${(error as Error).message}\n`);
  process.exit(1);
});
