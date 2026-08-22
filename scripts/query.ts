import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";

import { createClient, type Client, type Row } from "@libsql/client";

// Ad-hoc-SQL gegen eine der drei Datenbanken. Ersetzt das wiederkehrende
// "schnell mal ein Wegwerf-Script schreiben, um in die Daten zu schauen".
//
//   npm run db:query -- "SELECT * FROM weight_entries ORDER BY date DESC LIMIT 10"
//   npm run db:query -- --db=turso --format=csv "SELECT date, weight_kg FROM weight_entries"
//   npm run db:query -- --file=analyse.sql --db=turso
//
// Standardmäßig read-only: alles außer SELECT/WITH/PRAGMA/EXPLAIN braucht
// zusätzlich --write. Die Produktions-DB hängt hier mit dran, ein
// verrutschtes DELETE wäre nicht wiederherstellbar.
//
// Anders als `db:migrate` lädt dieses Script .env.local (siehe CONTEXT.md §7).

type Target = "local" | "turso" | "demo";
type Format = "table" | "json" | "csv";

const READONLY_PREFIXES = ["select", "with", "pragma", "explain"];

function usage(): string {
  return [
    "Usage: npm run db:query -- [flags] \"<SQL>\"",
    "",
    "Flags:",
    "  --db=local|turso|demo   Ziel-DB (default: local)",
    "  --format=table|json|csv Ausgabe (default: table)",
    "  --file=<pfad.sql>       SQL aus Datei statt Argument",
    "  --write                 Schreibende Statements erlauben",
    "  --tables                Alle Tabellen mit Zeilenzahl auflisten",
    "  --schema=<tabelle>      CREATE-Statement einer Tabelle zeigen",
  ].join("\n");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} ist nicht gesetzt — liegt der Wert in .env.local?`,
    );
  }
  return value;
}

function openClient(target: Target): Client {
  if (target === "local") {
    return createClient({ url: "file:./data/health.db" });
  }
  if (target === "demo") {
    return createClient({
      url: requireEnv("TURSO_DEMO_DATABASE_URL"),
      authToken: requireEnv("TURSO_DEMO_AUTH_TOKEN"),
    });
  }
  return createClient({
    url: requireEnv("TURSO_DATABASE_URL"),
    authToken: requireEnv("TURSO_AUTH_TOKEN"),
  });
}

function isReadOnly(sql: string): boolean {
  const stripped = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();
  return READONLY_PREFIXES.some((prefix) => stripped.startsWith(prefix));
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Uint8Array) return `<blob ${value.byteLength}b>`;
  return String(value);
}

function renderTable(columns: string[], rows: Row[]): string {
  if (rows.length === 0) return "(keine Zeilen)";
  const matrix = rows.map((row) =>
    columns.map((col) => cell((row as Record<string, unknown>)[col])),
  );
  const widths = columns.map((col, i) =>
    Math.max(col.length, ...matrix.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((text, i) => text.padEnd(widths[i])).join("  ").trimEnd();
  return [
    line(columns),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...matrix.map(line),
  ].join("\n");
}

function renderCsv(columns: string[], rows: Row[]): string {
  const escape = (text: string) =>
    /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  return [
    columns.map(escape).join(","),
    ...rows.map((row) =>
      columns
        .map((col) => escape(cell((row as Record<string, unknown>)[col])))
        .join(","),
    ),
  ].join("\n");
}

async function listTables(client: Client): Promise<void> {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const rows: Row[] = [];
  for (const table of tables.rows) {
    const name = String((table as Record<string, unknown>).name);
    const count = await client.execute(
      `SELECT count(*) AS n FROM "${name}"`,
    );
    rows.push({
      table: name,
      rows: (count.rows[0] as Record<string, unknown>).n,
    } as unknown as Row);
  }
  console.log(renderTable(["table", "rows"], rows));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith("--"));
  const positional = args.filter((arg) => !arg.startsWith("--"));

  const flagValue = (name: string): string | undefined => {
    const hit = flags.find((flag) => flag.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
  };

  const target = (flagValue("db") ?? "local") as Target;
  const format = (flagValue("format") ?? "table") as Format;
  const allowWrite = flags.includes("--write");

  if (!["local", "turso", "demo"].includes(target)) {
    throw new Error(`Unbekanntes --db=${target}. Erlaubt: local, turso, demo`);
  }
  if (!["table", "json", "csv"].includes(format)) {
    throw new Error(`Unbekanntes --format=${format}. Erlaubt: table, json, csv`);
  }

  const client = openClient(target);
  try {
    if (flags.includes("--tables")) {
      await listTables(client);
      return;
    }

    const schemaOf = flagValue("schema");
    if (schemaOf) {
      const result = await client.execute({
        sql: "SELECT sql FROM sqlite_master WHERE tbl_name = ? AND sql IS NOT NULL",
        args: [schemaOf],
      });
      if (result.rows.length === 0) {
        console.log(`Keine Tabelle "${schemaOf}" gefunden.`);
        return;
      }
      for (const row of result.rows) {
        console.log(`${cell((row as Record<string, unknown>).sql)};\n`);
      }
      return;
    }

    const file = flagValue("file");
    const sql = file ? readFileSync(file, "utf8") : positional[0];
    if (!sql?.trim()) {
      console.log(usage());
      process.exitCode = 1;
      return;
    }

    if (!isReadOnly(sql) && !allowWrite) {
      throw new Error(
        "Schreibendes Statement erkannt. Mit --write ausführen, wenn das Absicht ist.",
      );
    }

    const result = await client.execute(sql);
    const columns = [...result.columns];

    if (columns.length === 0) {
      console.log(`OK — ${result.rowsAffected} Zeile(n) betroffen.`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(result.rows, null, 2));
    } else if (format === "csv") {
      console.log(renderCsv(columns, result.rows));
    } else {
      console.log(renderTable(columns, result.rows));
      console.log(`\n(${result.rows.length} Zeilen — ${target})`);
    }
  } finally {
    client.close();
  }
}

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
