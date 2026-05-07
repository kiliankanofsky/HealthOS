import { db } from "../src/lib/db";
import { weightEntries } from "../src/lib/db/schema";
import { toLocalISODate } from "../src/lib/utils/date";

// Seed-Script: ~60 Tage realistische Gewichtsdaten.
// Startgewicht 75 kg, leichte tägliche Schwankungen, sanfter Abnahme-Trend.

const DAYS = 60;
const START_WEIGHT = 75.0;
const DAILY_TREND = -0.02; // ~1.2 kg über 60 Tage
const DAILY_NOISE = 0.5; // ±0.5 kg

function generate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    const dayIndex = DAYS - 1 - i;
    const trend = dayIndex * DAILY_TREND;
    const noise = (Math.random() * 2 - 1) * DAILY_NOISE;
    const weight = Math.round((START_WEIGHT + trend + noise) * 10) / 10;

    rows.push({
      date: toLocalISODate(d),
      weightKg: weight,
      source: "manual" as const,
      notes: null,
    });
  }
  return rows;
}

console.log(`Seeding ${DAYS} weight entries...`);
db.delete(weightEntries).run();
const rows = generate();
db.insert(weightEntries).values(rows).run();
console.log(`Inserted ${rows.length} entries.`);
console.log("First:", rows[0]);
console.log("Last:", rows[rows.length - 1]);
