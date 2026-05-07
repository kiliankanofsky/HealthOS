"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = {
  date: string;
  weight: number;
};

type Props = {
  data: ChartPoint[];
};

const SYSTEM_BLUE = "#007AFF";

export function WeightChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
        Keine Daten vorhanden.
      </div>
    );
  }

  const weights = data.map((d) => d.weight);
  const min = Math.floor(Math.min(...weights) - 0.5);
  const max = Math.ceil(Math.max(...weights) + 0.5);

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="currentColor" opacity={0.07} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => formatTickDate(value)}
            minTickGap={32}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            cursor={{ stroke: SYSTEM_BLUE, strokeOpacity: 0.2, strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
            labelFormatter={(label) => formatLabelDate(String(label))}
            formatter={(value) => [`${Number(value).toFixed(1)} kg`, "Gewicht"]}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={SYSTEM_BLUE}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatTickDate(iso: string): string {
  // YYYY-MM-DD → "DD.MM."
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function formatLabelDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
