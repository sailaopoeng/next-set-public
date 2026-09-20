"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ExerciseDetailAnalytics } from "@/server/analytics/calculations";

type StrengthPoint = ExerciseDetailAnalytics["strengthPoints"][number];

export function ExerciseStrengthChart({ points }: { points: StrengthPoint[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold">Strength over time</h2>
      <p className="mt-1 text-sm text-slate-600">
        Best estimated one-rep max and heaviest completed set per workout.
      </p>
      {points.length < 2 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Log this exercise in at least two completed workouts to see a trend.
        </p>
      ) : (
        <div aria-label="Exercise strength chart" className="mt-4 h-72 w-full min-w-0" role="img">
          <ResponsiveContainer height="100%" initialDimension={{ width: 320, height: 288 }} minHeight={288} width="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={24}
                tickFormatter={formatShortDate}
                tickLine={false}
              />
              <YAxis axisLine={false} tickLine={false} unit="kg" width={54} />
              <Tooltip
                formatter={(value, name) => [`${formatNumber(Number(value))}kg`, String(name)]}
                labelFormatter={(value) => formatLongDate(String(value))}
              />
              <Legend />
              <Line
                activeDot={{ r: 6 }}
                dataKey="estimatedOneRepMax"
                dot={{ r: 3 }}
                name="Estimated 1RM"
                stroke="#059669"
                strokeWidth={2.5}
                type="monotone"
              />
              <Line
                activeDot={{ r: 6 }}
                dataKey="maxWeight"
                dot={{ r: 3 }}
                name="Top set"
                stroke="#0ea5e9"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-SG", { maximumFractionDigits: 1 }).format(value);
}
