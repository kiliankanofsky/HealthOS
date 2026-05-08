// LOESS (Locally Estimated Scatterplot Smoothing) — lokale gewichtete lineare Regression.
// Für jeden Punkt wird ein gewichteter linearer Fit über die nächsten Nachbarn
// berechnet (Tricube-Kernel). Robuster gegen Rauschen als ein einfaches SMA und
// reagiert flexibel auf nicht-äquidistante Daten (Tageslücken sind ok).
//
// `span` ist der Anteil der Datenpunkte, der pro lokalem Fit verwendet wird (0..1).
// Faustregel: kleiner span = wackeliger, näher an Rohdaten; größer span = glatter,
// reagiert träger auf Trendwechsel.

export type SmoothInput = { date: string; weight: number };
export type SmoothPoint = { date: string; smoothed: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function loessSmooth(data: SmoothInput[], span: number): SmoothPoint[] {
  if (data.length === 0) return [];
  if (data.length < 3) {
    return data.map((d) => ({ date: d.date, smoothed: d.weight }));
  }

  const t0 = new Date(data[0].date).getTime();
  const xs = data.map((d) => (new Date(d.date).getTime() - t0) / DAY_MS);
  const ys = data.map((d) => d.weight);
  const n = data.length;
  const k = Math.max(3, Math.min(n, Math.floor(span * n)));

  const result: SmoothPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const x0 = xs[i];
    const dists = xs.map((x) => Math.abs(x - x0));
    const sorted = dists.slice().sort((a, b) => a - b);
    const maxDist = sorted[k - 1] || 1;

    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;

    for (let j = 0; j < n; j++) {
      const r = dists[j] / maxDist;
      if (r >= 1) continue;
      const w = (1 - r ** 3) ** 3; // Tricube
      const x = xs[j];
      const y = ys[j];
      sw += w;
      swx += w * x;
      swy += w * y;
      swxx += w * x * x;
      swxy += w * x * y;
    }

    if (sw === 0) {
      result[i] = { date: data[i].date, smoothed: ys[i] };
      continue;
    }

    const meanX = swx / sw;
    const meanY = swy / sw;
    const denom = swxx - sw * meanX * meanX;
    const slope = Math.abs(denom) > 1e-9 ? (swxy - sw * meanX * meanY) / denom : 0;
    const intercept = meanY - slope * meanX;
    result[i] = { date: data[i].date, smoothed: intercept + slope * x0 };
  }

  return result;
}

// Span-Empfehlung pro View. Fewer Datenpunkte → größerer Span, sonst klemmt
// die Glättung am ersten/letzten Punkt fest.
export function recommendedSpan(numPoints: number): number {
  if (numPoints <= 7) return 0.9;
  if (numPoints <= 28) return 0.4;
  if (numPoints <= 56) return 0.3;
  if (numPoints <= 90) return 0.25;
  return 0.18;
}
