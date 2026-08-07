// Captures the README screenshots.
//
//   npm run dev                              # in one terminal
//   npx playwright install chromium          # once
//   node scripts/screenshots.mjs             # in another terminal
//
// The browser enters the app through the public demo mode by setting the demo
// cookie directly — no login, no real account. That is deliberate: screenshots
// produced by this script cannot contain real health data, because the demo
// cookie routes every query to the separate demo database (see
// src/lib/db/index.ts → getDb()).
//
// Output: docs/screenshots/<page>-<desktop|mobile>.png

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const PAGES = [
  { name: "dashboard", path: "/" },
  { name: "endurance", path: "/endurance" },
  { name: "hypertrophy", path: "/hypertrophy" },
  { name: "weight", path: "/weight" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
  { name: "mobile", width: 393, height: 852, deviceScaleFactor: 3 },
];

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error(
      "\nPlaywright is not installed. It is not a project dependency because" +
        "\nit is only needed to refresh the README screenshots:" +
        "\n\n  npm i -D playwright && npx playwright install chromium\n",
    );
    process.exit(1);
  }
}

async function main() {
  const { chromium } = await loadPlaywright();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      colorScheme: "light",
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });

    // The demo cookie is the entire authentication story here.
    await context.addCookies([
      { name: "healthos_demo", value: "1", url: BASE_URL },
    ]);

    const page = await context.newPage();

    for (const target of PAGES) {
      const url = `${BASE_URL}${target.path}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

      // The Next.js dev-tools badge is not part of the product.
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });

      // Recharts animates on mount; give it a moment to settle.
      await page.waitForTimeout(2_000);

      if (page.url().includes("/account")) {
        throw new Error(
          `Redirected to the sign-in page at ${url} — the demo mode is not ` +
            `configured. Run \`npm run db:seed:demo\` first.`,
        );
      }

      // Viewport only, not fullPage: these pages scroll for several thousand
      // pixels, and a 1:8 aspect ratio renders as an unreadable sliver in a
      // README. The top of each page is the part worth showing anyway.
      const file = path.join(OUT_DIR, `${target.name}-${viewport.name}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${path.relative(ROOT, file)}`);
    }

    await context.close();
  }

  await browser.close();
  console.log(`\nDone. Review every image before committing.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
