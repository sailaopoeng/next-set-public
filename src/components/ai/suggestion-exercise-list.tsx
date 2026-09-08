"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import {
  ExerciseReplacementPicker,
  type ReplacementCandidate,
} from "@/components/exercises/exercise-replacement-picker";
import { SortableList } from "@/components/ui/sortable-list";
import { useAppActivity } from "@/components/ui/app-activity";

export type SuggestionExercise = {
  id: string;
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  rest_seconds: number;
  notes: string | null;
  exercise?: {
    name?: string | null;
    primary_muscle_group?: string | null;
  } | null;
};

export function SuggestionExerciseList({
  suggestionId,
  initialExercises,
  readOnly = false,
}: {
  suggestionId: string;
  initialExercises: SuggestionExercise[];
  readOnly?: boolean;
}) {
  const { fetchWithActivity } = useAppActivity();
  const [exercises, setExercises] = useState(() =>
    initialExercises.toSorted((a, b) => a.exercise_order - b.exercise_order),
  );
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  if (exercises.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
        No exercises saved for this suggestion.
      </p>
    );
  }

  if (readOnly) {
    return (
      <div className="space-y-2">
        {exercises.map((exercise) => (
          <SuggestionExerciseCard
            exercise={exercise}
            key={exercise.id}
            readOnly
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SortableList
        disabled={savingOrder}
        getLabel={(exercise) => exercise.exercise?.name ?? "exercise"}
        items={exercises}
        onReorder={(items) => void reorderExercises(items)}
        renderItem={(exercise, handle, compact) =>
          compact ? (
            <div className="flex h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-lg">
              {handle}
              <span className="truncate font-bold">
                {exercise.exercise?.name ?? "Exercise"}
              </span>
            </div>
          ) : (
            <SuggestionExerciseCard
              exercise={exercise}
              excludeExerciseIds={exercises.map((item) => item.exercise_id)}
              handle={handle}
              onReplace={replaceExercise}
            />
          )
        }
      />
      {savingOrder ? (
        <p className="text-xs font-medium text-slate-500">Saving order...</p>
      ) : null}
      {orderError ? (
        <p className="text-sm font-medium text-rose-700" role="alert">
          {orderError}
        </p>
      ) : null}
    </div>
  );

  async function reorderExercises(nextExercises: SuggestionExercise[]) {
    const previousExercises = exercises;
    const orderedExercises = nextExercises.map((exercise, index) => ({
      ...exercise,
      exercise_order: index + 1,
    }));

    setExercises(orderedExercises);
    setSavingOrder(true);
    setOrderError(null);

    const response = await fetchWithActivity(
      "Saving exercise order...",
      `/api/suggestions/${suggestionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseIds: orderedExercises.map((exercise) => exercise.id),
        }),
      },
    );

    if (!response.ok) {
      setExercises(previousExercises);
      setOrderError("Unable to save exercise order. Please try again.");
    }
    setSavingOrder(false);
  }

  async function replaceExercise(
    source: SuggestionExercise,
    candidate: ReplacementCandidate,
  ) {
    const response = await fetchWithActivity(
      "Replacing exercise...",
      `/api/suggestions/${suggestionId}/exercises/${source.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replacementExerciseId: candidate.exercise.id,
          target: candidate.target,
        }),
      },
    );

    if (!response.ok) throw new Error("Unable to replace suggestion exercise.");

    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === source.id
          ? {
              ...exercise,
              exercise_id: candidate.exercise.id,
              target_sets: candidate.target.sets,
              target_reps_min: candidate.target.repsMin,
              target_reps_max: candidate.target.repsMax,
              target_weight_kg: candidate.target.weightKg,
              rest_seconds: candidate.target.restSeconds,
              notes: candidate.target.notes,
              exercise: candidate.exercise,
            }
          : exercise,
      ),
    );
  }
}

function SuggestionExerciseCard({
  exercise,
  handle,
  readOnly = false,
  excludeExerciseIds = [],
  onReplace,
}: {
  exercise: SuggestionExercise;
  handle?: ReactNode;
  readOnly?: boolean;
  excludeExerciseIds?: string[];
  onReplace?: (
    source: SuggestionExercise,
    candidate: ReplacementCandidate,
  ) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1">
          {handle}
          <div className="min-w-0">
            <div className="truncate font-bold">
              {exercise.exercise?.name ?? "Exercise"}
            </div>
            <div className="mt-0.5 text-xs font-medium text-slate-500">
              {exercise.exercise?.primary_muscle_group ?? "muscle"} / rest{" "}
              {exercise.rest_seconds}s
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-slate-500 shadow-sm">
          #{exercise.exercise_order}
        </span>
      </div>
      <div className="mt-2 text-sm font-semibold tabular-nums text-slate-600">
        {exercise.target_sets} x {exercise.target_reps_min}
        -{exercise.target_reps_max}
        {exercise.target_weight_kg !== null
          ? ` @ ${exercise.target_weight_kg}kg`
          : ""}
      </div>
      {exercise.notes ? (
        <p className="mt-1.5 text-sm text-slate-500">{exercise.notes}</p>
      ) : null}
      {!readOnly && onReplace ? (
        <ExerciseReplacementPicker
          contextType="suggestion"
          currentTarget={{
            sets: exercise.target_sets,
            repsMin: exercise.target_reps_min,
            repsMax: exercise.target_reps_max,
            weightKg: exercise.target_weight_kg,
            restSeconds: exercise.rest_seconds,
            notes: exercise.notes,
          }}
          disabled={false}
          excludeExerciseIds={excludeExerciseIds}
          sourceExerciseId={exercise.exercise_id}
          onChoose={(candidate) => onReplace(exercise, candidate)}
        />
      ) : null}
    </div>
  );
}
