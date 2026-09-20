"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppLink } from "@/components/ui/app-activity";
import { useAppActivity } from "@/components/ui/app-activity";
import type { DeloadWeek, SavedWeeklyAnalysis } from "@/lib/domain";
import type {
  DashboardAnalytics,
  ExerciseRecords,
  SetAchievement,
  StrengthTrendSeries,
  VolumeAchievement,
  WeeklyTrendBucket,
} from "@/server/analytics/calculations";
import {
  formatSingaporeDateKey,
  getSingaporeWeekRangeFromKey,
  getSundayWeekRangeSingapore,
} from "@/server/analytics/calculations";

type TrendMetric = "completedSets" | "volume" | "workouts";

export function AnalyticsDashboard({
  analytics,
  analyses,
  deloadWeeks,
  sessionWeekStarts,
  isOwner,
}: {
  analytics: DashboardAnalytics;
  analyses: SavedWeeklyAnalysis[];
  deloadWeeks: DeloadWeek[];
  sessionWeekStarts: string[];
  isOwner: boolean;
}) {
  const currentWeek = formatSingaporeDateKey(getSundayWeekRangeSingapore().weekStart);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [savedAnalyses, setSavedAnalyses] = useState(analyses);
  const [markedDeloadWeeks, setMarkedDeloadWeeks] = useState(
    () => new Set(deloadWeeks.map((week) => week.week_start)),
  );
  const [error, setError] = useState<string | null>(null);
  const { fetchWithActivity } = useAppActivity();
  const weekOptions = useMemo(
    () => [...new Set([
      currentWeek,
      ...sessionWeekStarts,
      ...savedAnalyses.map((analysis) => analysis.week_start),
    ])].toSorted().reverse(),
    [currentWeek, savedAnalyses, sessionWeekStarts],
  );
  const selectedAnalysis = savedAnalyses.find(
    (analysis) => analysis.week_start === selectedWeek,
  );

  async function generateAnalysis() {
    setError(null);
    const response = await fetchWithActivity(
      selectedAnalysis ? "Refreshing weekly analysis..." : "Generating weekly analysis...",
      "/api/analytics/weekly-analysis",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: selectedWeek }),
      },
    );
    const body = await response.json().catch(() => null) as {
      analysis?: SavedWeeklyAnalysis;
      message?: string;
    } | null;
    if (!response.ok || !body?.analysis) {
      setError(body?.message ?? "Unable to generate the weekly analysis.");
      return;
    }
    setSavedAnalyses((current) => [
      body.analysis!,
      ...current.filter((analysis) => analysis.week_start !== selectedWeek),
    ]);
  }

  async function toggleDeloadWeek(weekStart: string) {
    const active = markedDeloadWeeks.has(weekStart);
    setError(null);
    const response = await fetchWithActivity(
      active ? "Removing deload week..." : "Marking deload week...",
      "/api/analytics/deload-weeks",
      {
        method: active ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          source: weekStart !== currentWeek && selectedAnalysis?.analysis_json.deload.recommended
            ? "ai_recommendation"
            : "manual",
        }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      setError(body?.message ?? "Unable to update the deload week.");
      return;
    }
    setMarkedDeloadWeeks((current) => {
      const next = new Set(current);
      if (active) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
    await generateAnalysis();
  }

  return (
    <div className="space-y-4">
      <WeeklyAnalysisPanel
        analysis={selectedAnalysis ?? null}
        currentWeek={currentWeek}
        error={error}
        isOwner={isOwner}
        markedDeloadWeeks={markedDeloadWeeks}
        onGenerate={() => void generateAnalysis()}
        onSelectWeek={setSelectedWeek}
        onToggleDeload={(weekStart) => void toggleDeloadWeek(weekStart)}
        selectedWeek={selectedWeek}
        weekOptions={weekOptions}
      />

      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">This week vs last week</h2>
          <p className="mt-1 text-sm text-slate-600">
            Compared at the same point in each Sunday-start week.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <ComparisonMetric
            current={analytics.weeklyComparison.current.workouts}
            delta={analytics.weeklyComparison.delta.workouts}
            label="Workouts"
            previous={analytics.weeklyComparison.previousComparable.workouts}
          />
          <ComparisonMetric
            current={analytics.weeklyComparison.current.completedSets}
            delta={analytics.weeklyComparison.delta.completedSets}
            label="Completed sets"
            previous={analytics.weeklyComparison.previousComparable.completedSets}
          />
          <ComparisonMetric
            current={analytics.weeklyComparison.current.volume}
            delta={analytics.weeklyComparison.delta.volume}
            label="Volume-load"
            previous={analytics.weeklyComparison.previousComparable.volume}
            unit="kg"
          />
          <Metric label="Weeks meeting target" value={analytics.weeksMeetingTarget} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Weekly muscle sets"
          description="Completed sets by muscle group; secondary work counts as half where applicable."
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analytics.muscleSetProgress}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="muscleGroup" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="previousSets"
                fill="#cbd5e1"
                name="Last week to date"
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="sets"
                fill="#059669"
                name="This week to date"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-2">
            {analytics.muscleSetProgress.map((item) => (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${targetStyle(item.status)}`}
                key={item.muscleGroup}
              >
                {item.muscleGroup}: {formatSets(item.sets)} / {item.minimum}-{item.maximum}
              </span>
            ))}
          </div>
        </ChartPanel>

        <WeeklyTrendPanel data={analytics.weeklyTrend} />
      </section>

      <StrengthTrendPanel
        defaultExerciseId={analytics.defaultStrengthExerciseId}
        trends={analytics.strengthTrends}
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold">Personal records</h2>
          <p className="mt-1 text-sm text-slate-600">
            All completed workout history. Equal records show the most recent hit.
          </p>
          <div className="mt-3 grid gap-2">
            <SetRecordCard
              label="Heaviest completed set"
              record={analytics.personalRecords.heaviestCompletedSet}
            />
            <SetRecordCard
              label="Highest estimated 1RM"
              record={analytics.personalRecords.highestEstimatedOneRepMax}
            />
            <VolumeRecordCard
              label="Highest workout volume"
              record={analytics.personalRecords.highestWorkoutVolume}
            />
          </div>
        </div>

        <RecoveryPanel events={analytics.fatigueWatchList} />
      </section>

      <ExerciseRecordPanel records={analytics.exerciseRecords} />
    </div>
  );
}

function WeeklyAnalysisPanel({
  analysis,
  currentWeek,
  selectedWeek,
  weekOptions,
  markedDeloadWeeks,
  isOwner,
  error,
  onSelectWeek,
  onGenerate,
  onToggleDeload,
}: {
  analysis: SavedWeeklyAnalysis | null;
  currentWeek: string;
  selectedWeek: string;
  weekOptions: string[];
  markedDeloadWeeks: Set<string>;
  isOwner: boolean;
  error: string | null;
  onSelectWeek: (value: string) => void;
  onGenerate: () => void;
  onToggleDeload: (weekStart: string) => void;
}) {
  const nextWeek = formatSingaporeDateKey(
    getSingaporeWeekRangeFromKey(currentWeek).weekEnd,
  );
  const report = analysis?.analysis_json;

  return (
    <details className="group rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Sparkles size={15} />
          </span>
          <span className="text-base font-bold">Weekly AI analysis</span>
        </span>
        <ChevronDown className="shrink-0 transition-transform group-open:rotate-180" size={20} />
      </summary>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-slate-600">
          Selected week plus the previous full week as a baseline.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Analysis week"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
            onChange={(event) => onSelectWeek(event.target.value)}
            value={selectedWeek}
          >
            {weekOptions.map((week) => (
              <option key={week} value={week}>{formatWeekOption(week)}</option>
            ))}
          </select>
          {isOwner ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
              onClick={onGenerate}
              type="button"
            >
              <RefreshCw size={15} />
              {analysis ? "Refresh" : "Generate"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      {!report ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          No saved analysis for this week.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="font-bold">
              Completed {report.workoutsCompleted} of {report.workoutTarget} sessions.
            </p>
            {report.summary !== `Completed ${report.workoutsCompleted} of ${report.workoutTarget} sessions.` ? (
              <p className="mt-1 text-sm text-slate-700">{report.summary}</p>
            ) : null}
          </div>
          <ReportList title="Analysis" items={report.observations} />
          <ReportList
            title="Next week"
            items={report.nextWeekActions.map((action) => action.text)}
          />
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">Deload</h3>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                report.deload.confirmedForNextWeek
                  ? "bg-blue-100 text-blue-800"
                  : report.deload.recommended
                    ? "bg-amber-100 text-amber-900"
                    : "bg-slate-100 text-slate-700"
              }`}>
                {report.deload.confirmedForSelectedWeek
                  ? "This week confirmed"
                  : report.deload.confirmedForNextWeek
                    ? "Next week confirmed"
                  : report.deload.recommended
                    ? "Recommended"
                    : "Not recommended"}
              </span>
            </div>
            {report.deload.reasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {report.deload.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            ) : null}
            {isOwner && selectedWeek === currentWeek ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <DeloadButton
                  active={markedDeloadWeeks.has(currentWeek)}
                  label="Current week"
                  onClick={() => onToggleDeload(currentWeek)}
                />
                <DeloadButton
                  active={markedDeloadWeeks.has(nextWeek)}
                  label="Next week"
                  onClick={() => onToggleDeload(nextWeek)}
                />
              </div>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            {analysis.provider === "gemini" ? "Gemini" : "Rule-based fallback"} · Updated {formatDateTime(analysis.updated_at)}
          </p>
        </div>
      )}
    </details>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function DeloadButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-10 rounded-full border px-3.5 text-xs font-bold ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-800"
          : "border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
      onClick={onClick}
      type="button"
    >
      {active ? `Unmark ${label}` : `Mark ${label} deload`}
    </button>
  );
}

function formatWeekOption(weekStart: string) {
  const range = getSingaporeWeekRangeFromKey(weekStart);
  const end = new Date(range.weekEnd.getTime() - 1);
  return `${formatShortDate(range.weekStart.toISOString())} – ${formatShortDate(end.toISOString())}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function WeeklyTrendPanel({ data }: { data: WeeklyTrendBucket[] }) {
  const [metric, setMetric] = useState<TrendMetric>("completedSets");
  const labels: Record<TrendMetric, string> = {
    completedSets: "Completed sets",
    volume: "Volume-load (kg)",
    workouts: "Workouts",
  };

  return (
    <ChartPanel
      title="12-week progress"
      description="The current week is in progress; previous weeks are complete."
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(labels) as TrendMetric[]).map((key) => (
          <button
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              metric === key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600"
            }`}
            key={key}
            onClick={() => setMetric(key)}
            type="button"
          >
            {labels[key]}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="weekStart" tickFormatter={formatShortDate} />
          <YAxis />
          <Tooltip
            labelFormatter={(value) => formatWeekLabel(String(value), data)}
            formatter={(value) => [formatNumber(Number(value)), labels[metric]]}
          />
          <Bar dataKey={metric} radius={[6, 6, 0, 0]}>
            {data.map((bucket) => (
              <Cell
                fill={bucket.isCurrent ? "#059669" : "#2563eb"}
                key={bucket.weekStart}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs font-medium text-emerald-700">
        Green bar: current week in progress
      </p>
    </ChartPanel>
  );
}

function StrengthTrendPanel({
  defaultExerciseId,
  trends,
}: {
  defaultExerciseId: string | null;
  trends: StrengthTrendSeries[];
}) {
  const [selectedId, setSelectedId] = useState(defaultExerciseId ?? "");
  const trend = useMemo(
    () =>
      trends.find((item) => item.exerciseId === selectedId) ??
      trends.find((item) => item.exerciseId === defaultExerciseId) ??
      trends[0],
    [defaultExerciseId, selectedId, trends],
  );

  return (
    <ChartPanel
      title="Estimated 1RM by exercise"
      description="Compare strength only within the same movement."
    >
      {trend ? (
        <>
          <label className="mb-3 block text-sm font-medium text-slate-600">
            Exercise
            <select
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-900"
              onChange={(event) => setSelectedId(event.target.value)}
              value={trend.exerciseId}
            >
              {trends.map((item) => (
                <option key={item.exerciseId} value={item.exerciseId}>
                  {item.exerciseName}
                </option>
              ))}
            </select>
          </label>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend.points.slice(-20)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => formatDate(String(value))}
                formatter={(value) => [`${formatNumber(Number(value))}kg`, "e1RM"]}
              />
              <Line
                dataKey="estimatedOneRepMax"
                dot
                name="e1RM"
                stroke="#2563eb"
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      ) : (
        <p className="text-sm text-slate-600">No completed weighted sets yet.</p>
      )}
    </ChartPanel>
  );
}

function ExerciseRecordPanel({ records }: { records: ExerciseRecords[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold">Records by exercise</h2>
      <p className="mt-1 text-sm text-slate-600">
        Compare repeatable performance within each exercise.
      </p>
      {records.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No completed sets yet.</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {records.map((record) => (
            <article className="rounded-2xl bg-slate-50 p-3" key={record.exerciseId}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">{record.exerciseName}</h3>
                {record.isMainLift ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                    Main lift
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <ExerciseRecordLine
                  label="Weight"
                  record={record.heaviestCompletedSet}
                  value={`${formatNumber(record.heaviestCompletedSet.value)}kg x ${record.heaviestCompletedSet.reps}`}
                />
                <ExerciseRecordLine
                  label="e1RM"
                  record={record.highestEstimatedOneRepMax}
                  value={
                    record.highestEstimatedOneRepMax
                      ? `${formatNumber(record.highestEstimatedOneRepMax.value)}kg`
                      : "-"
                  }
                />
                <ExerciseRecordLine
                  label="Volume"
                  record={record.highestWorkoutVolume}
                  value={`${formatNumber(record.highestWorkoutVolume.value)}kg`}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RecoveryPanel({
  events,
}: {
  events: DashboardAnalytics["fatigueWatchList"];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold">Recovery flags</h2>
      <p className="mt-1 text-sm text-slate-600">Recent signals that block load increases.</p>
      <div className="mt-3 space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-600">
            No current pain or repeated high-RPE flags.
          </p>
        ) : (
          events.map((event) => (
            <AppLink
              className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
              href={`/sessions/${event.sessionId}`}
              key={`${event.type}-${event.sessionId}-${event.exerciseName}`}
            >
              <span className="font-bold">{event.exerciseName}</span>
              <span> | {event.reason}</span>
              <span className="mt-1 block text-xs font-medium text-amber-800">
                {event.sessionName} | {formatDate(event.performedAt)}
              </span>
            </AppLink>
          ))
        )}
      </div>
    </div>
  );
}

function ComparisonMetric({
  current,
  delta,
  label,
  previous,
  unit = "",
}: {
  current: number;
  delta: number;
  label: string;
  previous: number;
  unit?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 text-xl font-extrabold tabular-nums tracking-tight md:text-2xl">
        {formatNumber(current)}
        {unit}
      </div>
      <div className={`mt-1 text-xs font-bold ${deltaStyle(delta)}`}>
        {formatDelta(delta, unit)} vs last week
      </div>
      <div className="text-[11px] font-medium text-slate-500">
        Last: {formatNumber(previous)}
        {unit}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 text-xl font-extrabold tabular-nums tracking-tight md:text-2xl">{value}</div>
      <div className="mt-1 text-[11px] font-medium text-slate-500">Sunday-start tracking</div>
    </div>
  );
}

function SetRecordCard({
  label,
  record,
}: {
  label: string;
  record: SetAchievement | null;
}) {
  if (!record) return <EmptyRecord label={label} />;

  return (
    <AppLink
      className="block rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
      href={`/sessions/${record.sessionId}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="font-extrabold tabular-nums">{formatNumber(record.value)}kg</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-800">
        {record.exerciseName} | {formatNumber(record.weightKg)}kg x {record.reps}
      </p>
      <p className="text-xs text-slate-500">
        {record.sessionName} | {formatDate(record.performedAt)} | View workout
      </p>
    </AppLink>
  );
}

function VolumeRecordCard({
  label,
  record,
}: {
  label: string;
  record: VolumeAchievement | null;
}) {
  if (!record) return <EmptyRecord label={label} />;

  return (
    <AppLink
      className="block rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
      href={`/sessions/${record.sessionId}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="font-extrabold tabular-nums">{formatNumber(record.value)}kg</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-800">{record.sessionName}</p>
      <p className="text-xs text-slate-500">
        {formatDate(record.performedAt)} | View workout
      </p>
    </AppLink>
  );
}

function ExerciseRecordLine({
  label,
  record,
  value,
}: {
  label: string;
  record: { sessionId: string; performedAt: string } | null;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      {record ? (
        <AppLink
          className="text-right font-semibold text-emerald-700"
          href={`/sessions/${record.sessionId}`}
        >
          {value} <span className="block text-xs font-normal">{formatDate(record.performedAt)}</span>
        </AppLink>
      ) : (
        <span className="font-semibold text-slate-500">{value}</span>
      )}
    </div>
  );
}

function EmptyRecord({ label }: { label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-1 text-sm font-medium text-slate-500">No completed sets yet.</p>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold">{title}</h2>
      {description ? <p className="mb-3 mt-1 text-sm text-slate-600">{description}</p> : null}
      {children}
    </div>
  );
}

function targetStyle(status: DashboardAnalytics["muscleSetProgress"][number]["status"]) {
  if (status === "in_range") return "bg-emerald-50 text-emerald-700";
  if (status === "above_range") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function deltaStyle(delta: number) {
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-amber-700";
  return "text-slate-500";
}

function formatDelta(value: number, unit: string) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)}${unit}`;
}

function formatSets(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-SG", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatWeekLabel(value: string, data: WeeklyTrendBucket[]) {
  const bucket = data.find((item) => item.weekStart === value);
  return `${formatShortDate(value)}${bucket?.isCurrent ? " (in progress)" : ""}`;
}
