import * as cheerio from "cheerio";

import type { NewNutritionEntry } from "@/lib/db/schema";
import type { NutritionSourceAdapter } from "./types";

// fddb.info Tagebuch-Scraper.
//
// Auth: Session-Cookie `fddb=<value>` aus dem Browser (DevTools → Application →
// Cookies → fddb.info → Cookie `fddb`). In `.env.local` als `FDDB_COOKIE` ablegen.
// Optional Basic-Auth via `FDDB_BASIC_AUTH` (base64 von user:pass) — fddb verlangt
// das zusätzlich in manchen Pfaden. Beides analog zu itobey/fddb-exporter.
//
// Endpoint: GET /db/i18n/myday20/?lang=en&q=<to>&p=<from>
//   from/to sind Unix-Sekunden (UTC). Für einen einzelnen Tag:
//     from = 00:00 UTC dieses Tages, to = 23:59:59 UTC dieses Tages.

const FDDB_BASE_URL = "https://fddb.info";
const PRODUCT_TABLE_SELECTOR = "table.myday-table-std tbody tr";

export class FddbAuthError extends Error {
  constructor(message = "fddb-Login nicht erfolgreich — Cookie prüfen (FDDB_COOKIE).") {
    super(message);
    this.name = "FddbAuthError";
  }
}

export class FddbNoDataError extends Error {
  constructor(date: string) {
    super(`Keine Einträge in fddb für ${date}`);
    this.name = "FddbNoDataError";
  }
}

type FddbDayTotals = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
};

function parseGermanNumber(text: string): number {
  // fddb liefert je nach Pfad/Locale verschiedene Formate:
  //   "1.234 kcal" (de, Tausenderpunkt)
  //   "12,3 g"     (de, Dezimalkomma)
  //   "141.9 g"    (en, Dezimalpunkt)
  // Strategie: erst Einheiten/Whitespace strippen, dann anhand der
  // vorhandenen Separatoren entscheiden, was Dezimal vs. Tausender ist.
  const stripped = text
    .replace(/ /g, " ")
    .replace(/[a-zA-Z%]+/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (stripped === "") return 0;

  const hasDot = stripped.includes(".");
  const hasComma = stripped.includes(",");
  let normalized: string;
  if (hasDot && hasComma) {
    // "1.234,5" — Punkt = Tausender, Komma = Dezimal.
    normalized = stripped.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    // "12,3" — Komma = Dezimal.
    normalized = stripped.replace(/,/g, ".");
  } else {
    // "141.9" oder "1234" — Punkt (falls vorhanden) = Dezimal.
    normalized = stripped;
  }
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function isoToUnixRange(date: string): { from: number; to: number } {
  // Tag in UTC. 00:00 → 23:59:59.
  const from = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const to = from + 86399;
  return { from, to };
}

function* iterateDates(since: string, until: string): Generator<string> {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (start > end) return;
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    yield `${y}-${m}-${d}`;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildHeaders(cookie: string, basicAuth?: string): HeadersInit {
  const headers: Record<string, string> = {
    Cookie: `fddb=${cookie}`,
    // fddb antwortet sonst manchmal mit einer "Bot"-Seite.
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
  };
  if (basicAuth) headers.Authorization = `Basic ${basicAuth}`;
  return headers;
}

function checkAuth($: cheerio.CheerioAPI): void {
  // fddb zeigt im nicht eingeloggten Zustand einen Login-Link in der Quicklinks-Leiste.
  const loginLinks = $("div.quicklinks a.v2hdlnk")
    .filter((_, el) => {
      const t = $(el).text().trim();
      return t === "Anmelden" || t === "Login";
    });
  if (loginLinks.length > 0) {
    throw new FddbAuthError();
  }
}

function parseTotalsRow($: cheerio.CheerioAPI): {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} | null {
  const rows = $(PRODUCT_TABLE_SELECTOR);
  if (rows.length === 0) return null;

  // Letzte Zeile = Tagessumme. Spalten (0-indiziert):
  //   0: Bezeichnung, 1: Menge, 2: kcal, 3: Fett, 4: KH, 5: Eiweiß
  const lastRow = rows.eq(rows.length - 1);
  const cells = lastRow.find("td");
  if (cells.length < 6) return null;

  return {
    caloriesKcal: Math.round(parseGermanNumber(cells.eq(2).text())),
    fatG: parseGermanNumber(cells.eq(3).text()),
    carbsG: parseGermanNumber(cells.eq(4).text()),
    proteinG: parseGermanNumber(cells.eq(5).text()),
  };
}

function parseFiberSugar($: cheerio.CheerioAPI): {
  fiberG: number | null;
  sugarG: number | null;
} {
  // fddb listet "davon Zucker" und "Ballaststoffe" in einer Detail-Tabelle
  // unter den Produkten. Anstatt brüchige XPaths zu nutzen, suchen wir
  // nach den Label-Texten und nehmen den Wert aus der Nachbarzelle.
  let fiberG: number | null = null;
  let sugarG: number | null = null;

  $("td").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (sugarG === null && (text === "davon zucker" || text.startsWith("davon zucker"))) {
      const valueCell = $(el).next("td");
      if (valueCell.length > 0) sugarG = parseGermanNumber(valueCell.text());
    }
    if (fiberG === null && (text === "ballaststoffe" || text.startsWith("ballaststoffe"))) {
      const valueCell = $(el).next("td");
      if (valueCell.length > 0) fiberG = parseGermanNumber(valueCell.text());
    }
  });

  return { fiberG, sugarG };
}

async function fetchDayHtml(
  date: string,
  cookie: string,
  basicAuth?: string,
): Promise<string> {
  const { from, to } = isoToUnixRange(date);
  const url = `${FDDB_BASE_URL}/db/i18n/myday20/?lang=de&q=${to}&p=${from}`;
  // Bei großen Backfills schließt fddb gelegentlich die Verbindung
  // (UND_ERR_SOCKET) oder antwortet mit 5xx. Wir versuchen es mehrfach
  // mit exponentiellem Backoff, statt den gesamten Lauf abzubrechen.
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { headers: buildHeaders(cookie, basicAuth) });
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`fddb HTTP ${res.status} für ${date}`);
      }
      if (!res.ok) {
        // 4xx (außer 429) sind keine transienten Fehler — nicht retryen.
        throw Object.assign(
          new Error(`fddb HTTP ${res.status} für ${date} (${url})`),
          { permanent: true },
        );
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if ((err as { permanent?: boolean }).permanent) throw err;
      if (attempt < maxAttempts) {
        const backoff = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`fddb fetch fehlgeschlagen für ${date}`);
}

export function parseFddbDay(html: string, date: string): FddbDayTotals {
  const $ = cheerio.load(html);
  checkAuth($);

  const totals = parseTotalsRow($);
  if (!totals) {
    throw new FddbNoDataError(date);
  }
  const { fiberG, sugarG } = parseFiberSugar($);
  return { ...totals, fiberG, sugarG };
}

export const fddbAdapter: NutritionSourceAdapter = {
  name: "fddb",

  async fetchNutritionEntries({ since, until }) {
    const cookie = process.env.FDDB_COOKIE;
    if (!cookie) {
      throw new Error(
        "FDDB_COOKIE fehlt in .env.local — Cookie `fddb=...` aus Browser-DevTools kopieren.",
      );
    }
    const basicAuth = process.env.FDDB_BASIC_AUTH;
    const endDate = until ?? todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error("since/until müssen YYYY-MM-DD sein.");
    }

    const entries: NewNutritionEntry[] = [];
    const failedDates: { date: string; reason: string }[] = [];
    for (const date of iterateDates(since, endDate)) {
      try {
        const html = await fetchDayHtml(date, cookie, basicAuth);
        const totals = parseFddbDay(html, date);
        entries.push({
          date,
          source: "fddb",
          caloriesKcal: totals.caloriesKcal,
          proteinG: totals.proteinG,
          carbsG: totals.carbsG,
          fatG: totals.fatG,
          fiberG: totals.fiberG,
          sugarG: totals.sugarG,
        });
      } catch (err) {
        if (err instanceof FddbAuthError) {
          // Cookie ungültig — Abbruch, weiterversuchen bringt nichts.
          throw err;
        }
        if (err instanceof FddbNoDataError) {
          // Tag ohne Einträge — überspringen, kein 0-Eintrag.
          continue;
        }
        const reason = err instanceof Error ? err.message : String(err);
        failedDates.push({ date, reason });
        console.warn(`⚠️  ${date} übersprungen: ${reason}`);
      }
      // Sanftes Rate-Limit, fddb mag keine Bursts.
      await new Promise((r) => setTimeout(r, 500));
    }
    if (failedDates.length > 0) {
      console.warn(
        `\n${failedDates.length} Tag(e) konnten nicht geholt werden. ` +
          `Erneut versuchen mit:\n  npm run db:sync:nutrition -- --since=${failedDates[0].date}`,
      );
    }
    return entries;
  },
};
