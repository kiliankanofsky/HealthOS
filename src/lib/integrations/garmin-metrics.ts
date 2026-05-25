import { GarminConnect } from "@gooin/garmin-connect";

import { upsertDailyMetrics } from "@/lib/db/queries";

// ============================================================
// Garmin Daily Metrics — Snapshot pro Tag:
//   Longevity:  RHR, HRV, Sleep
//   Performance: VO2 Max (Run), Lactate Threshold, Training Status,
//                Race Predictions (5k / 10k / HM / M).
//
// Strategie: jeden Endpoint in eigenem try/catch — wenn ein Wert fehlt
// (Garmin liefert nicht jeden Tag alles), bleibt das Feld `null`. Der
// upsert überschreibt bestehende Daten — der jüngste Sync gewinnt.
// ============================================================

export type ImportLogEntry = {
  level: "info" | "warn" | "error";
  message: string;
};

export type MetricsImportResult = {
  daysProcessed: number;
  log: ImportLogEntry[];
};

export type MetricsImportOptions = {
  client: GarminConnect;
  // Liste von ISO-Daten YYYY-MM-DD. Default: heute.
  dates?: string[];
  dryRun?: boolean;
};

type RaceTimeRow = {
  calendarDate?: string;
  // Garmin liefert die Felder als `timeXK` (Sekunden), nicht `raceTimeXK`.
  time5K?: number | null;
  time10K?: number | null;
  timeHalfMarathon?: number | null;
  timeMarathon?: number | null;
};

type MaxMetRow = {
  calendarDate?: string;
  generic?: {
    vo2MaxValue?: number | null;
    fitnessAge?: number | null;
  } | null;
  cycling?: { vo2MaxValue?: number | null } | null;
  heatAltitudeAcclimation?: unknown;
  runningLactateThreshold?: {
    heartRateValue?: number | null;
    speedValue?: number | null;
  } | null;
};

export async function syncGarminDailyMetrics(
  options: MetricsImportOptions,
): Promise<MetricsImportResult> {
  const { client, dates, dryRun = false } = options;
  const log: ImportLogEntry[] = [];

  const today = new Date().toISOString().slice(0, 10);
  const targetDates = dates && dates.length > 0 ? dates : [today];

  // displayName einmal vorab — gemeinsame Quelle für maxmet/racepredictions.
  let displayName: string | null = null;
  try {
    const profile = await client.getUserProfile();
    displayName = profile.displayName as unknown as string;
  } catch (err) {
    log.push({
      level: "warn",
      message: `Konnte displayName nicht laden — VO2-/Race-Endpoints werden übersprungen (${(err as Error).message}).`,
    });
  }

  for (const dateIso of targetDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      log.push({
        level: "warn",
        message: `Datum "${dateIso}" ist nicht YYYY-MM-DD — übersprungen.`,
      });
      continue;
    }

    const date = new Date(`${dateIso}T12:00:00Z`);

    const fields: Parameters<typeof upsertDailyMetrics>[0] = {
      date: dateIso,
      restingHeartRate: null,
      restingHeartRate7dAvg: null,
      hrvLastNight: null,
      hrvStatus: null,
      hrvBaselineLowUpper: null,
      hrvBaselineBalancedLow: null,
      hrvBaselineBalancedUpper: null,
      hrvBaselineMarker: null,
      sleepScore: null,
      sleepDurationSec: null,
      deepSleepSec: null,
      lightSleepSec: null,
      remSleepSec: null,
      awakeSleepSec: null,
      sleepStartLocal: null,
      sleepEndLocal: null,
      sleepQuality: null,
      vo2MaxRunning: null,
      lactateThresholdHr: null,
      lactateThresholdPaceSecPerKm: null,
      trainingStatus: null,
      racePrediction5k: null,
      racePrediction10k: null,
      racePredictionHalfMarathon: null,
      racePredictionMarathon: null,
    };
    const rawSources: Record<string, unknown> = {};

    // 1) Resting Heart Rate (Garmin liefert auch 7-Tage-Avg im selben Response).
    try {
      const hr = (await client.getHeartRate(date)) as
        | {
            restingHeartRate?: number;
            lastSevenDaysAvgRestingHeartRate?: number;
          }
        | undefined;
      if (typeof hr?.restingHeartRate === "number") {
        fields.restingHeartRate = hr.restingHeartRate;
      }
      if (typeof hr?.lastSevenDaysAvgRestingHeartRate === "number") {
        fields.restingHeartRate7dAvg = hr.lastSevenDaysAvgRestingHeartRate;
      }
      rawSources.heartRate = hr;
    } catch (err) {
      log.push({
        level: "warn",
        message: `${dateIso} HR: ${(err as Error).message}`,
      });
    }

    // 2) HRV + Baseline-Korridor.
    try {
      const hrv = await client.getHRVData(date);
      const summary = hrv?.hrvSummary;
      if (summary) {
        if (typeof summary.lastNightAvg === "number") {
          fields.hrvLastNight = summary.lastNightAvg;
        }
        if (typeof summary.status === "string") {
          fields.hrvStatus = summary.status;
        }
        const baseline = summary.baseline as
          | {
              lowUpper?: number;
              balancedLow?: number;
              balancedUpper?: number;
              markerValue?: number;
            }
          | undefined;
        if (baseline) {
          if (typeof baseline.lowUpper === "number")
            fields.hrvBaselineLowUpper = baseline.lowUpper;
          if (typeof baseline.balancedLow === "number")
            fields.hrvBaselineBalancedLow = baseline.balancedLow;
          if (typeof baseline.balancedUpper === "number")
            fields.hrvBaselineBalancedUpper = baseline.balancedUpper;
          if (typeof baseline.markerValue === "number")
            fields.hrvBaselineMarker = baseline.markerValue;
        }
      }
      rawSources.hrv = hrv;
    } catch (err) {
      log.push({
        level: "warn",
        message: `${dateIso} HRV: ${(err as Error).message}`,
      });
    }

    // 3) Sleep — Score, Dauer, Stadien, Start/End-Zeiten, Quality.
    try {
      const sleep = await client.getSleepData(date);
      const dailyDto = sleep?.dailySleepDTO as
        | {
            sleepTimeSeconds?: number;
            sleepScores?: {
              overall?: { value?: number; qualifierKey?: string };
            };
            deepSleepSeconds?: number;
            lightSleepSeconds?: number;
            remSleepSeconds?: number;
            awakeSleepSeconds?: number;
            sleepStartTimestampLocal?: number;
            sleepEndTimestampLocal?: number;
            sleepScoreFeedback?: string;
          }
        | undefined;
      if (typeof dailyDto?.sleepTimeSeconds === "number") {
        fields.sleepDurationSec = dailyDto.sleepTimeSeconds;
      }
      const score = dailyDto?.sleepScores?.overall?.value;
      if (typeof score === "number") {
        fields.sleepScore = score;
      }
      const qualifier = dailyDto?.sleepScores?.overall?.qualifierKey;
      if (typeof qualifier === "string") {
        fields.sleepQuality = qualifier;
      }
      if (typeof dailyDto?.deepSleepSeconds === "number")
        fields.deepSleepSec = dailyDto.deepSleepSeconds;
      if (typeof dailyDto?.lightSleepSeconds === "number")
        fields.lightSleepSec = dailyDto.lightSleepSeconds;
      if (typeof dailyDto?.remSleepSeconds === "number")
        fields.remSleepSec = dailyDto.remSleepSeconds;
      if (typeof dailyDto?.awakeSleepSeconds === "number")
        fields.awakeSleepSec = dailyDto.awakeSleepSeconds;
      // Garmin liefert die Zeitstempel als Epoch-ms in Lokalzeit.
      if (typeof dailyDto?.sleepStartTimestampLocal === "number") {
        fields.sleepStartLocal = new Date(
          dailyDto.sleepStartTimestampLocal,
        ).toISOString();
      }
      if (typeof dailyDto?.sleepEndTimestampLocal === "number") {
        fields.sleepEndLocal = new Date(
          dailyDto.sleepEndTimestampLocal,
        ).toISOString();
      }
      rawSources.sleep = sleep;
    } catch (err) {
      log.push({
        level: "warn",
        message: `${dateIso} Sleep: ${(err as Error).message}`,
      });
    }

    // 4) Training Status (mehrere Geräte → wir nehmen den ersten Eintrag).
    try {
      const ts = await client.getTrainingStatus(date);
      const map = ts?.latestTrainingStatusData;
      if (map && typeof map === "object") {
        const firstKey = Object.keys(map)[0];
        if (firstKey) {
          const data = map[firstKey];
          // trainingStatus ist ein numerischer Code in Garmin — wir behalten
          // das `trainingStatusFeedbackPhrase` als lesbaren String.
          const phrase = (data as { trainingStatusFeedbackPhrase?: string })
            .trainingStatusFeedbackPhrase;
          if (typeof phrase === "string" && phrase.length > 0) {
            fields.trainingStatus = phrase;
          }
        }
      }
      rawSources.trainingStatus = ts;
    } catch (err) {
      log.push({
        level: "warn",
        message: `${dateIso} TrainingStatus: ${(err as Error).message}`,
      });
    }

    // 5) VO2 Max + Lactate Threshold (MaxMet endpoint).
    // WICHTIG: MaxMet erwartet das **Datum** als Pfad-Suffix, nicht den
    // displayName (anders als RacePredictions weiter unten).
    if (displayName) {
      try {
        const maxmet = await client.client.get<MaxMetRow | MaxMetRow[]>(
          `https://connectapi.garmin.com/metrics-service/metrics/maxmet/latest/${dateIso}`,
        );
        const row = Array.isArray(maxmet) ? maxmet[0] : maxmet;
        if (row) {
          if (typeof row.generic?.vo2MaxValue === "number") {
            fields.vo2MaxRunning = row.generic.vo2MaxValue;
          }
          if (typeof row.runningLactateThreshold?.heartRateValue === "number") {
            fields.lactateThresholdHr =
              row.runningLactateThreshold.heartRateValue;
          }
          // Garmin liefert Pace als Speed in m/s → sec/km = 1000 / m/s.
          const speed = row.runningLactateThreshold?.speedValue;
          if (typeof speed === "number" && speed > 0) {
            fields.lactateThresholdPaceSecPerKm = 1000 / speed;
          }
        }
        rawSources.maxmet = maxmet;
      } catch (err) {
        log.push({
          level: "warn",
          message: `${dateIso} MaxMet: ${(err as Error).message}`,
        });
      }

      // 6) Race Predictions.
      try {
        const race = await client.client.get<RaceTimeRow | RaceTimeRow[]>(
          `https://connectapi.garmin.com/metrics-service/metrics/racepredictions/latest/${displayName}`,
        );
        const row = Array.isArray(race) ? race[0] : race;
        if (row) {
          fields.racePrediction5k = numOrNull(row.time5K);
          fields.racePrediction10k = numOrNull(row.time10K);
          fields.racePredictionHalfMarathon = numOrNull(row.timeHalfMarathon);
          fields.racePredictionMarathon = numOrNull(row.timeMarathon);
        }
        rawSources.racePredictions = race;
      } catch (err) {
        log.push({
          level: "warn",
          message: `${dateIso} RacePredictions: ${(err as Error).message}`,
        });
      }
    }

    // 7) Lactate Threshold — eigener Endpoint, keine Pfad-Parameter.
    // Liefert ein Array: ein Eintrag mit `speed` (m/s), ein zweiter mit
    // `hearRate` (Tippfehler in Garmin's API — Feld heißt wirklich so ohne t).
    type LtRow = {
      calendarDate?: string | null;
      speed?: number | null;
      hearRate?: number | null; // Garmin-Tippfehler (fehlendes "t")
      heartRate?: number | null; // falls Garmin das mal korrigiert
      heartRateCycling?: number | null;
      heartRateRowing?: number | null;
    };
    try {
      const lt = await client.client.get<LtRow | LtRow[]>(
        `https://connectapi.garmin.com/biometric-service/biometric/latestLactateThreshold`,
      );
      const rows: LtRow[] = Array.isArray(lt) ? lt : lt ? [lt] : [];
      // HR und Speed über alle Einträge sammeln — Garmin verteilt die Werte
      // auf separate Zeilen.
      let hr: number | null = null;
      let speed: number | null = null;
      for (const r of rows) {
        const rowHr =
          typeof r.heartRate === "number"
            ? r.heartRate
            : typeof r.hearRate === "number"
              ? r.hearRate
              : null;
        if (hr === null && rowHr !== null && Number.isFinite(rowHr)) {
          hr = rowHr;
        }
        if (
          speed === null &&
          typeof r.speed === "number" &&
          Number.isFinite(r.speed) &&
          r.speed > 0
        ) {
          speed = r.speed;
        }
      }
      if (hr !== null) {
        fields.lactateThresholdHr = Math.round(hr);
      }
      if (speed !== null) {
        // Garmin's latestLactateThreshold liefert speed um Faktor 10 zu klein
        // (empirisch: 0.414 würde sonst 2415 sec/km = 40:15/km ergeben, was
        // physiologisch unmöglich ist). Korrektur × 10 → m/s.
        const speedMs = speed * 10;
        fields.lactateThresholdPaceSecPerKm = 1000 / speedMs;
      }
      rawSources.lactateThreshold = lt;
    } catch (err) {
      log.push({
        level: "warn",
        message: `${dateIso} LactateThreshold: ${(err as Error).message}`,
      });
    }

    fields.rawJson = JSON.stringify(rawSources);

    if (dryRun) {
      log.push({
        level: "info",
        message: `(dry) ${dateIso} — RHR=${fields.restingHeartRate} HRV=${fields.hrvLastNight} Sleep=${fields.sleepScore} VO2=${fields.vo2MaxRunning}`,
      });
    } else {
      await upsertDailyMetrics(fields);
      log.push({
        level: "info",
        message: `${dateIso} gespeichert (RHR=${fields.restingHeartRate ?? "—"}, HRV=${fields.hrvLastNight ?? "—"}, Sleep=${fields.sleepScore ?? "—"}, VO2=${fields.vo2MaxRunning ?? "—"})`,
      });
    }
  }

  return { daysProcessed: targetDates.length, log };
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
