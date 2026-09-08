"use client";

import { useState, type KeyboardEvent } from "react";
import { Pencil, Save, X } from "lucide-react";

import { useAppActivity, useTrackedRouter } from "@/components/ui/app-activity";
import { WEEKLY_MUSCLE_GROUPS, type WeeklyMuscleTargetSettings } from "@/lib/weekly-targets";
import type { MuscleSetProgress } from "@/server/analytics/calculations";

type ProgressView = "rings" | "bars";

const VIEWS: Array<{ id: ProgressView; label: string }> = [
  { id: "rings", label: "Rings" },
  { id: "bars", label: "Bars" },
];

const RING_COLORS: Record<string, string> = {
  chest: "#f43f5e",
  back: "#f97316",
  shoulders: "#eab308",
  quads: "#10b981",
  hamstrings: "#06b6d4",
  biceps: "#3b82f6",
  triceps: "#8b5cf6",
};

const RING_SIZE = 288;
const RING_CENTER = RING_SIZE / 2;
const OUTER_RADIUS = 126;
const RING_STEP = 18;
const RING_WIDTH = 11;

export function MuscleProgressCard({
  progress,
  targets,
  isOwner,
}: {
  progress: MuscleSetProgress[];
  targets: WeeklyMuscleTargetSettings;
  isOwner: boolean;
}) {
  const [view, setView] = useState<ProgressView>("rings");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(targets);
  const [error, setError] = useState<string | null>(null);
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();

  async function saveTargets() {
    setError(null);
    const response = await fetchWithActivity(
      "Saving weekly targets...",
      "/api/profile/weekly-muscle-targets",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      setError(body?.message ?? "Unable to save weekly targets.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % VIEWS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + VIEWS.length) % VIEWS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = VIEWS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextView = VIEWS[nextIndex].id;
    setView(nextView);
    document.getElementById(`muscle-progress-${nextView}-tab`)?.focus();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold">Weekly hypertrophy sets</h2>
          <p className="mt-1 text-sm text-slate-600">
            Completed working sets since Sunday. Secondary work counts as half a
            set, except arms track direct sets only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                setDraft(targets);
                setError(null);
                setEditing((value) => !value);
              }}
              type="button"
            >
              {editing ? <X size={14} /> : <Pencil size={14} />}
              {editing ? "Cancel" : "Edit targets"}
            </button>
          ) : null}
          <div
            aria-label="Weekly hypertrophy sets view"
            className="flex shrink-0 rounded-full bg-slate-100 p-1 dark:bg-slate-800"
            role="tablist"
          >
            {VIEWS.map((option, index) => (
            <button
              aria-controls={`muscle-progress-${option.id}-panel`}
              aria-selected={view === option.id}
              className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${
                view === option.id
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              id={`muscle-progress-${option.id}-tab`}
              key={option.id}
              onClick={() => setView(option.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              role="tab"
              tabIndex={view === option.id ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
            ))}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {WEEKLY_MUSCLE_GROUPS.map((muscleGroup) => (
              <div className="rounded-xl bg-white p-2.5 dark:bg-slate-900" key={muscleGroup}>
                <div className="mb-2 text-sm font-bold capitalize">{muscleGroup}</div>
                <div className="grid grid-cols-2 gap-2">
                  <TargetInput
                    label="Min"
                    onChange={(minimum) => setDraft((current) => ({
                      ...current,
                      [muscleGroup]: { ...current[muscleGroup], minimum },
                    }))}
                    value={draft[muscleGroup].minimum}
                  />
                  <TargetInput
                    label="Max"
                    onChange={(maximum) => setDraft((current) => ({
                      ...current,
                      [muscleGroup]: { ...current[muscleGroup], maximum },
                    }))}
                    value={draft[muscleGroup].maximum}
                  />
                </div>
              </div>
            ))}
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
          <button
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
            onClick={() => void saveTargets()}
            type="button"
          >
            <Save size={16} />
            Save targets
          </button>
        </div>
      ) : null}

      {view === "rings" ? (
        <div
          aria-labelledby="muscle-progress-rings-tab"
          id="muscle-progress-rings-panel"
          role="tabpanel"
        >
          <MuscleRings progress={progress} />
        </div>
      ) : (
        <div
          aria-labelledby="muscle-progress-bars-tab"
          id="muscle-progress-bars-panel"
          role="tabpanel"
        >
          <MuscleBars progress={progress} />
        </div>
      )}
    </section>
  );
}

function TargetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
      <input
        className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-base text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        inputMode="decimal"
        max={50}
        min={0.5}
        onChange={(event) => onChange(Number(event.target.value))}
        step={0.5}
        type="number"
        value={value}
      />
    </label>
  );
}

function MuscleRings({ progress }: { progress: MuscleSetProgress[] }) {
  return (
    <div className="grid items-center gap-5 md:grid-cols-[minmax(260px,300px)_1fr]">
      <svg
        aria-label="Weekly minimum set target progress rings. A complete ring means its muscle group has reached its minimum target."
        className="pointer-events-none mx-auto h-auto w-full max-w-72 select-none text-slate-200 dark:text-slate-800"
        role="img"
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      >
        {progress.map((item, index) => {
          const radius = OUTER_RADIUS - index * RING_STEP;
          const circumference = 2 * Math.PI * radius;
          const fill = Math.min(item.sets / item.minimum, 1);

          return (
            <g key={item.muscleGroup}>
              <circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                fill="none"
                r={radius}
                stroke="currentColor"
                strokeWidth={RING_WIDTH}
              />
              {fill > 0 ? (
                <circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  fill="none"
                  r={radius}
                  stroke={muscleColor(item.muscleGroup)}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - fill)}
                  strokeLinecap="round"
                  strokeWidth={RING_WIDTH}
                  transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">
          Closed ring = minimum weekly target reached.
        </p>
        <div className="grid gap-2 sm:grid-cols-2" aria-label="Muscle progress legend">
          {progress.map((item) => (
            <div className="rounded-xl bg-slate-50 p-2.5" key={item.muscleGroup}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-bold capitalize">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: muscleColor(item.muscleGroup) }}
                  />
                  {item.muscleGroup}
                </span>
                <span className="whitespace-nowrap tabular-nums text-slate-600">
                  {formatSets(item.sets)} / {item.minimum}-{item.maximum}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">{statusLabel(item)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MuscleBars({ progress }: { progress: MuscleSetProgress[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {progress.map((item) => {
        const fill = Math.min(100, (item.sets / item.maximum) * 100);
        const threshold = (item.minimum / item.maximum) * 100;
        const color =
          item.status === "below_target"
            ? "bg-slate-400"
            : item.status === "in_range"
              ? "bg-emerald-600"
              : "bg-amber-500";

        return (
          <div key={item.muscleGroup}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="font-bold capitalize">{item.muscleGroup}</span>
              <span className="tabular-nums text-slate-600">
                {formatSets(item.sets)} / {item.minimum}-{item.maximum} sets
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${fill}%` }} />
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 bg-slate-700/50"
                style={{ left: `${threshold}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">{statusLabel(item)}</p>
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(item: MuscleSetProgress) {
  return item.status === "below_target"
    ? "Below target"
    : item.status === "in_range"
      ? "In range"
      : "Above range";
}

function muscleColor(muscleGroup: string) {
  return RING_COLORS[muscleGroup] ?? "#64748b";
}

function formatSets(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
