"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  Link2,
  Plus,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Unlink,
  Wand2,
  X,
} from "lucide-react";

import {
  ExerciseReplacementPicker,
  type ReplacementCandidate,
} from "@/components/exercises/exercise-replacement-picker";
import { useAppActivity, useTrackedRouter } from "@/components/ui/app-activity";
import { Button } from "@/components/ui/button";
import { SortableList } from "@/components/ui/sortable-list";
import type { Exercise, TemplateExercise, WorkoutTemplate } from "@/lib/domain";

type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
};

type PreparedExercise = {
  id: string;
  exerciseId: string;
  exerciseOrder: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetWeightKg: number | null;
  targetSetWeightsKg: Array<number | null>;
  restSeconds: number;
  supersetGroupId: string | null;
  notes: string | null;
  exercise: Exercise;
};

type PreparedDraft = {
  schemaVersion: 1;
  name: string;
  sourceTemplateId: string | null;
  notes: string | null;
  exercises: PreparedExercise[];
};

type CoachSet = {
  setNumber: number;
  reps: number;
  weightKg: number | null;
  restSeconds?: number | null;
  notes?: string | null;
};

type CoachExercise = {
  exerciseName: string;
  primaryMuscleGroup?: string | null;
  equipment?: string | null;
  notes?: string | null;
  sets: CoachSet[];
  safetyNotes: string[];
  match: {
    status: "matched" | "needs_confirmation" | "unmatched";
    exercise: Exercise | null;
    candidates: Exercise[];
    reason: string;
  };
};

type CoachWorkout = {
  schemaVersion: 1;
  name: string;
  rationale: string | null;
  exercises: CoachExercise[];
};

type CoachInputs = {
  energy: "low" | "normal" | "high";
  muscleSoreness: "none" | "moderate" | "severe";
  availableMinutes: 15 | 30 | 45 | 60 | 75;
  instruction: string;
};

const STORAGE_KEY = "nextset.prepared-session.v1";
const COACH_STORAGE_KEY = "nextset.ai-coach.v2";

export function PreparedSessionEditor({
  exercises,
  templates,
  userId,
}: {
  exercises: Exercise[];
  templates: TemplateWithExercises[];
  userId: string;
}) {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const storageKey = `${STORAGE_KEY}.${userId}`;
  const [libraryExercises, setLibraryExercises] = useState(exercises);
  const [draft, setDraft] = useState<PreparedDraft>(() => emptyDraft());
  const [hydrated, setHydrated] = useState(false);
  const [droppedMissingExercises, setDroppedMissingExercises] = useState(false);
  const [exerciseToAddId, setExerciseToAddId] = useState(exercises[0]?.id ?? "");
  const [exerciseAdded, setExerciseAdded] = useState(false);
  const exerciseAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [templateToLoadId, setTemplateToLoadId] = useState(templates[0]?.id ?? "");
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const filteredExercises = useMemo(() => {
    const query = exerciseFilter.trim().toLowerCase();
    return query
      ? libraryExercises.filter((exercise) =>
          exercise.name.toLowerCase().includes(query),
        )
      : libraryExercises;
  }, [exerciseFilter, libraryExercises]);
  const selectedExerciseToAddId =
    filteredExercises.find((exercise) => exercise.id === exerciseToAddId)?.id ??
    filteredExercises[0]?.id ??
    "";

  useEffect(() => {
    return () => {
      if (exerciseAddedTimeoutRef.current) {
        clearTimeout(exerciseAddedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setHydrated(true);
        return;
      }

      const parsed = parseStoredDraft(stored, libraryExercises);
      if (parsed) {
        setDraft(parsed.draft);
        setDroppedMissingExercises(parsed.droppedMissingExercises);
      }
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [libraryExercises, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(serializeDraft(draft)));
  }, [draft, hydrated, storageKey]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <ClipboardList size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              Prepare next session
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Build a plan now. A live workout is created only when you start it.
            </p>
          </div>
        </div>
      </section>

      <CoachDraftPanel
        exercises={libraryExercises}
        fetchWithActivity={fetchWithActivity}
        onExerciseAdded={(exercise) => {
          setLibraryExercises((current) =>
            current.some((item) => item.id === exercise.id)
              ? current
              : [...current, exercise].toSorted((a, b) =>
                  a.name.localeCompare(b.name),
                ),
          );
        }}
        onImport={(nextDraft) => {
          setDraft(nextDraft);
          setDroppedMissingExercises(false);
        }}
        userId={userId}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-bold text-slate-700">
          Plan name
          <input
            className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 text-base"
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </label>
        <label className="mt-4 block text-sm font-bold text-slate-700">
          Notes
          <textarea
            className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            placeholder="Optional session note"
            value={draft.notes ?? ""}
            onChange={(event) =>
              updateDraft({ notes: event.target.value || null })
            }
          />
        </label>
      </section>

      {templates.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold">Load from template</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base"
              value={templateToLoadId}
              onChange={(event) => setTemplateToLoadId(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              className="w-full sm:w-auto"
              onClick={loadTemplate}
              type="button"
              variant="secondary"
            >
              <Save size={16} />
              Load
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold">Add exercise</h2>
        <div className="relative mt-3">
          <input
            aria-label="Filter exercises"
            className="h-12 w-full rounded-xl border border-slate-300 px-3 pr-12 text-base"
            placeholder="Search by exercise name"
            type="search"
            value={exerciseFilter}
            onChange={(event) => setExerciseFilter(event.target.value)}
          />
          {exerciseFilter ? (
            <button
              aria-label="Clear exercise filter"
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-900"
              onClick={() => setExerciseFilter("")}
              type="button"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base"
            disabled={filteredExercises.length === 0}
            value={selectedExerciseToAddId}
            onChange={(event) => setExerciseToAddId(event.target.value)}
          >
            {filteredExercises.length === 0 ? (
              <option value="">No matching exercises</option>
            ) : (
              filteredExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))
            )}
          </select>
          <Button
            onClick={addExercise}
            disabled={!selectedExerciseToAddId}
            className="w-full sm:w-auto"
            type="button"
            variant="secondary"
          >
            {exerciseAdded ? <Check size={16} /> : <Plus size={16} />}
            {exerciseAdded ? "Added" : "Add"}
          </Button>
        </div>
      </section>

      {droppedMissingExercises ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Some saved draft exercises were removed because they are no longer in
          your library.
        </p>
      ) : null}

      {draft.exercises.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          No prepared exercises yet. Add one above or load a template.
        </p>
      ) : null}

      <SortableList
        getGroupId={(exercise) => exercise.supersetGroupId}
        getLabel={(exercise) => exercise.exercise.name}
        items={draft.exercises}
        onReorder={reorderExercises}
        renderItem={(exercise, handle, compact) => {
          const index = draft.exercises.findIndex((item) => item.id === exercise.id);
          if (compact) {
            return (
              <div className="flex h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-lg">
                {handle}
                <span className="truncate font-bold">{exercise.exercise.name}</span>
              </div>
            );
          }

          const groupIndex = exercise.supersetGroupId
            ? draft.exercises.findIndex(
                (item) => item.supersetGroupId === exercise.supersetGroupId,
              )
            : -1;
          const nextExercise = draft.exercises[index + 1];
          const canPairWithNext =
            !exercise.supersetGroupId &&
            Boolean(nextExercise) &&
            !nextExercise?.supersetGroupId &&
            nextExercise?.targetSets === exercise.targetSets;

          return (
            <section className={`rounded-2xl border bg-white p-4 shadow-sm ${exercise.supersetGroupId ? "border-emerald-300" : "border-slate-200"}`}>
              {exercise.supersetGroupId ? (
                <div className="mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-emerald-700">
                  <span>Superset {index === groupIndex ? "A" : "B"}</span>
                  {index === groupIndex ? (
                    <Button onClick={() => removeSuperset(exercise.supersetGroupId as string)} variant="ghost">
                      <Unlink size={15} /> Remove superset
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="mb-3 flex items-start gap-2">
                {handle}
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold">
                    {exercise.exercise.name}
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {exercise.exercise.primary_muscle_group} /{" "}
                    {exercise.exercise.equipment ?? "equipment optional"}
                  </p>
                </div>
                <Button
                  aria-label={`Remove ${exercise.exercise.name}`}
                  className="min-h-9 px-2.5"
                  onClick={() => removeExercise(index)}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <ExerciseReplacementPicker
                contextType="prep"
                currentTarget={{
                  sets: exercise.targetSets,
                  repsMin: exercise.targetRepsMin,
                  repsMax: exercise.targetRepsMax,
                  weightKg: exercise.targetWeightKg,
                  restSeconds: exercise.restSeconds,
                  notes: exercise.notes,
                }}
                excludeExerciseIds={draft.exercises.map((item) => item.exerciseId)}
                sourceExerciseId={exercise.exerciseId}
                onChoose={(candidate) => replaceExercise(index, candidate)}
              />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <NumberField
                  label="Sets"
                  value={exercise.targetSets}
                  onChange={(value) => updateSetCount(index, value)}
                />
                <NumberField
                  label="Rep min"
                  value={exercise.targetRepsMin}
                  onChange={(value) =>
                    updateExercise(index, { targetRepsMin: value })
                  }
                />
                <NumberField
                  label="Rep max"
                  value={exercise.targetRepsMax}
                  onChange={(value) =>
                    updateExercise(index, { targetRepsMax: value })
                  }
                />
                <NumberField
                  label="Default kg"
                  value={exercise.targetWeightKg ?? 0}
                  step={0.5}
                  onChange={(value) => updateDefaultWeight(index, value)}
                />
                <NumberField
                  label={exercise.supersetGroupId ? "Rest after round" : "Rest"}
                  value={exercise.restSeconds}
                  onChange={(value) =>
                    updateRest(index, value)
                  }
                />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Set weights
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {Array.from({ length: exercise.targetSets }, (_, setIndex) => (
                    <NumberField
                      key={setIndex}
                      label={`Set ${setIndex + 1} kg`}
                      value={getSetWeightValue(exercise, setIndex)}
                      step={0.5}
                      onChange={(value) =>
                        updateSetWeight(index, setIndex, value)
                      }
                    />
                  ))}
                </div>
              </div>
              <label className="mt-4 block text-sm font-bold text-slate-700">
                Exercise note
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  value={exercise.notes ?? ""}
                  onChange={(event) =>
                    updateExercise(index, {
                      notes: event.target.value || null,
                    })
                  }
                />
              </label>
              {canPairWithNext ? (
                <Button className="mt-3 w-full" onClick={() => createSuperset(index)} variant="secondary">
                  <Link2 size={16} /> Superset with next
                </Button>
              ) : null}
            </section>
          );
        }}
      />

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-40 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-xl backdrop-blur-md md:bottom-4">
        {actionError ? (
          <p
            className="mb-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={resetDraft}
            disabled={starting}
            type="button"
            variant="secondary"
          >
            <RotateCcw size={16} />
            Reset
          </Button>
          <Button
            onClick={() => void startPreparedSession()}
            disabled={starting || draft.exercises.length === 0}
            type="button"
          >
            <Play size={16} />
            {starting ? "Starting..." : "Start"}
          </Button>
        </div>
      </div>
    </div>
  );

  function updateDraft(update: Partial<PreparedDraft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function loadTemplate() {
    const template = templates.find((item) => item.id === templateToLoadId);
    if (!template) return;

    setDraft({
      schemaVersion: 1,
      name: template.name,
      sourceTemplateId: template.id,
      notes: template.description,
      exercises: template.workout_template_exercises.map((exercise, index) => ({
        id: `draft-${crypto.randomUUID()}`,
        exerciseId: exercise.exercise_id,
        exerciseOrder: index + 1,
        targetSets: exercise.target_sets,
        targetRepsMin: exercise.target_reps_min,
        targetRepsMax: exercise.target_reps_max,
        targetWeightKg: exercise.target_weight_kg,
        targetSetWeightsKg: resizeSetWeights(
          exercise.target_set_weights_kg,
          exercise.target_sets,
          exercise.target_weight_kg,
        ),
        restSeconds: exercise.rest_seconds,
        supersetGroupId: exercise.superset_group_id ?? null,
        notes: exercise.notes,
        exercise: exercise.exercise,
      })),
    });
    setDroppedMissingExercises(false);
  }

  function addExercise() {
    const exercise = libraryExercises.find(
      (item) => item.id === selectedExerciseToAddId,
    );
    if (!exercise) return;
    if (draft.exercises.some((item) => item.exerciseId === exercise.id)) return;

    const nextExercise: PreparedExercise = {
      id: `draft-${crypto.randomUUID()}`,
      exerciseId: exercise.id,
      exerciseOrder: draft.exercises.length + 1,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetWeightKg: 0,
      targetSetWeightsKg: [0, 0, 0],
      restSeconds: 90,
      supersetGroupId: null,
      notes: null,
      exercise,
    };

    updateDraft({ exercises: orderExercises([...draft.exercises, nextExercise]) });
    flashExerciseAdded();
  }

  function flashExerciseAdded() {
    setExerciseAdded(true);
    if (exerciseAddedTimeoutRef.current) {
      clearTimeout(exerciseAddedTimeoutRef.current);
    }
    exerciseAddedTimeoutRef.current = setTimeout(() => {
      setExerciseAdded(false);
      exerciseAddedTimeoutRef.current = null;
    }, 2000);
  }

  function removeExercise(index: number) {
    const removedGroupId = draft.exercises[index]?.supersetGroupId;
    updateDraft({
      exercises: orderExercises(
        draft.exercises
          .filter((_, exerciseIndex) => exerciseIndex !== index)
          .map((exercise) =>
            removedGroupId && exercise.supersetGroupId === removedGroupId
              ? { ...exercise, supersetGroupId: null }
              : exercise,
          ),
      ),
    });
  }

  function reorderExercises(exercises: PreparedExercise[]) {
    updateDraft({ exercises: orderExercises(exercises) });
  }

  async function replaceExercise(
    index: number,
    candidate: ReplacementCandidate,
  ) {
    const current = draft.exercises[index];
    if (!current) return;
    if (
      draft.exercises.some(
        (exercise, exerciseIndex) =>
          exerciseIndex !== index &&
          exercise.exerciseId === candidate.exercise.id,
      )
    ) {
      throw new Error("Exercise already exists in this draft.");
    }

    updateExercise(index, {
      exerciseId: candidate.exercise.id,
      exercise: candidate.exercise,
      targetSets: candidate.target.sets,
      targetRepsMin: candidate.target.repsMin,
      targetRepsMax: candidate.target.repsMax,
      targetWeightKg: candidate.target.weightKg,
      targetSetWeightsKg: resizeSetWeights(
        [],
        candidate.target.sets,
        candidate.target.weightKg,
      ),
      restSeconds: candidate.target.restSeconds,
      notes: candidate.target.notes,
    });
  }

  function updateExercise(index: number, update: Partial<PreparedExercise>) {
    updateDraft({
      exercises: draft.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, ...update } : exercise,
      ),
    });
  }

  function createSuperset(index: number) {
    const nextExercise = draft.exercises[index + 1];
    if (!nextExercise || nextExercise.targetSets !== draft.exercises[index].targetSets) {
      return;
    }
    const groupId = crypto.randomUUID();
    updateDraft({
      exercises: draft.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index || exerciseIndex === index + 1
          ? {
              ...exercise,
              supersetGroupId: groupId,
              restSeconds: nextExercise.restSeconds,
            }
          : exercise,
      ),
    });
  }

  function removeSuperset(groupId: string) {
    updateDraft({
      exercises: draft.exercises.map((exercise) =>
        exercise.supersetGroupId === groupId
          ? { ...exercise, supersetGroupId: null }
          : exercise,
      ),
    });
  }

  function updateRest(index: number, restSeconds: number) {
    const groupId = draft.exercises[index]?.supersetGroupId;
    updateDraft({
      exercises: draft.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index || (groupId && exercise.supersetGroupId === groupId)
          ? { ...exercise, restSeconds }
          : exercise,
      ),
    });
  }

  function updateSetCount(index: number, targetSets: number) {
    const exercise = draft.exercises[index];
    if (!exercise) return;
    const clampedSets = Math.max(1, Math.min(12, targetSets));
    const groupId = exercise.supersetGroupId;
    updateDraft({
      exercises: draft.exercises.map((item, itemIndex) =>
        itemIndex === index || (groupId && item.supersetGroupId === groupId)
          ? {
              ...item,
              targetSets: clampedSets,
              targetSetWeightsKg: resizeSetWeights(
                item.targetSetWeightsKg,
                clampedSets,
                item.targetWeightKg,
              ),
            }
          : item,
      ),
    });
  }

  function updateDefaultWeight(index: number, weightKg: number) {
    const exercise = draft.exercises[index];
    if (!exercise) return;
    const previousDefault = exercise.targetWeightKg ?? 0;
    const setWeights = resizeSetWeights(
      exercise.targetSetWeightsKg,
      exercise.targetSets,
      previousDefault,
    );
    const shouldUpdateSetWeights = setWeights.every(
      (setWeight) => (setWeight ?? 0) === previousDefault,
    );
    updateExercise(index, {
      targetWeightKg: weightKg,
      targetSetWeightsKg: shouldUpdateSetWeights
        ? Array.from({ length: exercise.targetSets }, () => weightKg)
        : setWeights,
    });
  }

  function updateSetWeight(index: number, setIndex: number, weightKg: number) {
    const exercise = draft.exercises[index];
    if (!exercise) return;
    const setWeights = resizeSetWeights(
      exercise.targetSetWeightsKg,
      exercise.targetSets,
      exercise.targetWeightKg,
    );
    setWeights[setIndex] = weightKg;
    updateExercise(index, { targetSetWeightsKg: setWeights });
  }

  function resetDraft() {
    setDraft(emptyDraft());
    setDroppedMissingExercises(false);
  }

  async function startPreparedSession() {
    setStarting(true);
    setActionError(null);

    try {
      const response = await fetchWithActivity(
        "Starting prepared workout...",
        "/api/sessions/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prepared: {
              name: draft.name || "Prepared workout",
              sourceTemplateId: draft.sourceTemplateId,
              notes: draft.notes,
              exercises: draft.exercises.map((exercise, index) => ({
                exerciseId: exercise.exerciseId,
                exerciseOrder: index + 1,
                targetSets: exercise.targetSets,
                targetRepsMin: exercise.targetRepsMin,
                targetRepsMax: exercise.targetRepsMax,
                targetWeightKg: exercise.targetWeightKg,
                targetSetWeightsKg: resizeSetWeights(
                  exercise.targetSetWeightsKg,
                  exercise.targetSets,
                  exercise.targetWeightKg,
                ),
                restSeconds: exercise.restSeconds,
                supersetGroupId: exercise.supersetGroupId,
                notes: exercise.notes,
              })),
            },
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        session?: { id: string };
        message?: string;
      } | null;

      if (!response.ok || !body?.session?.id) {
        setActionError(body?.message ?? "Unable to start prepared workout.");
        return;
      }

      window.localStorage.removeItem(storageKey);
      router.push(`/sessions/${body.session.id}`);
    } catch {
      setActionError("Unable to start prepared workout. Please try again.");
    } finally {
      setStarting(false);
    }
  }
}

function CoachDraftPanel({
  exercises,
  fetchWithActivity,
  onExerciseAdded,
  onImport,
  userId,
}: {
  exercises: Exercise[];
  fetchWithActivity: ReturnType<typeof useAppActivity>["fetchWithActivity"];
  onExerciseAdded: (exercise: Exercise) => void;
  onImport: (draft: PreparedDraft) => void;
  userId: string;
}) {
  const storageKey = `${COACH_STORAGE_KEY}.${userId}`;
  const [instruction, setInstruction] = useState("");
  const [energy, setEnergy] = useState<CoachInputs["energy"]>("normal");
  const [muscleSoreness, setMuscleSoreness] =
    useState<CoachInputs["muscleSoreness"]>("none");
  const [availableMinutes, setAvailableMinutes] =
    useState<CoachInputs["availableMinutes"]>(45);
  const [submittedRequest, setSubmittedRequest] = useState<CoachInputs | null>(null);
  const [workout, setWorkout] = useState<CoachWorkout | null>(null);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Record<number, string>>(
    {},
  );
  const [coachHydrated, setCoachHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingExerciseIndex, setAddingExerciseIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            inputs?: unknown;
            submittedRequest?: unknown;
            workout?: unknown;
            selectedExerciseIds?: unknown;
          };
          if (isCoachInputs(parsed.inputs)) {
            setInstruction(parsed.inputs.instruction);
            setEnergy(parsed.inputs.energy);
            setMuscleSoreness(parsed.inputs.muscleSoreness);
            setAvailableMinutes(parsed.inputs.availableMinutes);
          }
          if (isCoachInputs(parsed.submittedRequest)) {
            setSubmittedRequest(parsed.submittedRequest);
          }
          if (isCoachWorkout(parsed.workout)) {
            setWorkout(parsed.workout);
          }
          if (isStringRecord(parsed.selectedExerciseIds)) {
            setSelectedExerciseIds(parsed.selectedExerciseIds);
          }
        }
      } catch {
        // localStorage may be unavailable; the coach still works for this page load.
      } finally {
        setCoachHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!coachHydrated) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          inputs: { energy, muscleSoreness, availableMinutes, instruction },
          submittedRequest,
          workout,
          selectedExerciseIds,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [
    availableMinutes,
    coachHydrated,
    energy,
    instruction,
    muscleSoreness,
    selectedExerciseIds,
    storageKey,
    submittedRequest,
    workout,
  ]);

  const unresolvedCount =
    workout?.exercises.filter((exercise, index) => !resolvedExercise(index, exercise))
      .length ?? 0;
  const duplicateResolvedIds = workout ? duplicateResolvedExerciseIds(workout) : 0;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <button
        aria-controls="ai-coach-body"
        aria-expanded={isExpanded}
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        type="button"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Brain size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold">AI coach draft</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ask for an adjustment, review the flat draft, then import it into this
            prepared workout.
          </p>
        </div>
        <ChevronDown
          className={`mt-2 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          size={18}
        />
      </button>

      {isExpanded ? (
        <div id="ai-coach-body">
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <CoachChoice
              label="Energy"
              options={["low", "normal", "high"]}
              value={energy}
              onChange={(value) => setEnergy(value as CoachInputs["energy"])}
            />
            <CoachChoice
              label="Muscle soreness"
              options={["none", "moderate", "severe"]}
              value={muscleSoreness}
              onChange={(value) =>
                setMuscleSoreness(value as CoachInputs["muscleSoreness"])
              }
            />
          </div>

          <label className="mt-4 block text-sm font-bold text-slate-700">
            <span className="flex items-center justify-between gap-3">
              Available time
              <output className="rounded-full bg-white px-2.5 py-0.5 text-xs tabular-nums text-emerald-700 shadow-sm">{availableMinutes} min</output>
            </span>
            <input
              aria-label="Available workout time in minutes"
              className="mt-2 h-8 w-full accent-emerald-600"
              max={75}
              min={15}
              onChange={(event) =>
                setAvailableMinutes(Number(event.target.value) as CoachInputs["availableMinutes"])
              }
              step={15}
              type="range"
              value={availableMinutes}
            />
            <span className="flex justify-between text-xs font-medium text-slate-500">
              <span>15</span><span>30</span><span>45</span><span>60</span><span>75</span>
            </span>
          </label>

          <label className="mt-4 block text-sm font-bold text-slate-700">
            Coach note <span className="font-normal text-slate-500">(optional)</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-base"
              placeholder="My quads are sore. Add more shoulder work."
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button disabled={loading} onClick={() => void generateCoachDraft(false)} type="button">
              <Wand2 size={16} />
              {loading && !workout ? "Generating..." : "Generate"}
            </Button>
            <Button
              disabled={loading || !workout || !submittedRequest}
              onClick={() => void generateCoachDraft(true)}
              type="button"
              variant="secondary"
            >
              <RotateCcw size={16} />
              {loading && workout ? "Retrying..." : "Retry"}
            </Button>
            <Button
              disabled={loading || !workout || unresolvedCount > 0 || duplicateResolvedIds > 0}
              onClick={importCoachDraft}
              type="button"
              variant="secondary"
            >
              <Save size={16} />
              Import to prep
            </Button>
            {workout ? (
              <Button
                disabled={loading}
                onClick={clearCoachSuggestion}
                type="button"
                variant="ghost"
              >
                <Trash2 size={16} />
                Clear suggestion
              </Button>
            ) : null}
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
              {error}
            </p>
          ) : null}

          {workout ? (
            <div className="mt-4 space-y-3">
              {submittedRequest ? (
                <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm">
                  <div className="font-bold text-emerald-800">You</div>
                  <p className="mt-1 capitalize text-slate-700">
                    Energy: {submittedRequest.energy} / Soreness: {submittedRequest.muscleSoreness} / Time: {submittedRequest.availableMinutes} min
                  </p>
                  {submittedRequest.instruction ? (
                    <p className="mt-1 text-slate-600">{submittedRequest.instruction}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="font-bold">{workout.name}</div>
                {workout.rationale ? (
                  <p className="mt-1 text-sm text-slate-600">{workout.rationale}</p>
                ) : null}
                {unresolvedCount > 0 ? (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                    <AlertTriangle size={14} />
                    Resolve {unresolvedCount} exercise
                    {unresolvedCount === 1 ? "" : "s"} before import.
                  </p>
                ) : null}
                {duplicateResolvedIds > 0 ? (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                    <AlertTriangle size={14} />
                    Choose unique exercises before import.
                  </p>
                ) : null}
              </div>

              {workout.exercises.map((exercise, index) => {
                const selectedExercise = resolvedExercise(index, exercise);

                return (
                  <article
                    className="rounded-xl border border-emerald-100 bg-white p-3"
                    key={`${exercise.exerciseName}-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold">{exercise.exerciseName}</div>
                        <div className="mt-0.5 text-xs font-medium text-slate-500">
                          {exercise.primaryMuscleGroup ?? "muscle"} /{" "}
                          {exercise.equipment ?? "equipment optional"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          selectedExercise
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {selectedExercise ? "matched" : exercise.match.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
                      {exercise.sets.map((set) => (
                        <p className="tabular-nums" key={set.setNumber}>
                          Set {set.setNumber}:{" "}
                          {set.weightKg !== null ? `${formatNumber(set.weightKg)}kg` : "-kg"} x{" "}
                          {set.reps}
                          {set.restSeconds ? ` / rest ${set.restSeconds}s` : ""}
                          {set.notes ? ` / ${set.notes}` : ""}
                        </p>
                      ))}
                    </div>

                    {exercise.notes ? (
                      <p className="mt-2 text-sm text-slate-500">{exercise.notes}</p>
                    ) : null}
                    {exercise.safetyNotes.length > 0 ? (
                      <div className="mt-2 space-y-1 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">
                        {exercise.safetyNotes.map((note) => (
                          <p key={note}>{note}</p>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <select
                        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                        value={selectedExercise?.id ?? ""}
                        onChange={(event) =>
                          setSelectedExerciseIds((current) => ({
                            ...current,
                            [index]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select existing exercise</option>
                        {preferredExerciseOptions(exercise, exercises).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        disabled={addingExerciseIndex !== null}
                        onClick={() => void addMissingExercise(index, exercise)}
                        type="button"
                        variant="secondary"
                      >
                        <Plus size={16} />
                        {addingExerciseIndex === index ? "Adding..." : "Add as new"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  async function generateCoachDraft(retry: boolean) {
    const request = retry
      ? submittedRequest
      : { energy, muscleSoreness, availableMinutes, instruction: instruction.trim() };
    if (!request) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithActivity(
        retry ? "Retrying coach draft..." : "Generating coach draft...",
        "/api/coach/suggest",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...request,
            ...(retry ? { retryToken: crypto.randomUUID() } : {}),
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        workout?: CoachWorkout;
        message?: string;
      } | null;

      if (!response.ok || !body?.workout) {
        setError(body?.message ?? "Unable to generate a coach draft.");
        return;
      }

      setWorkout(body.workout);
      setSubmittedRequest(request);
      setSelectedExerciseIds({});
      if (!retry) setInstruction("");
    } catch {
      setError("Unable to generate a coach draft. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function addMissingExercise(index: number, exercise: CoachExercise) {
    setAddingExerciseIndex(index);
    setError(null);

    try {
      const response = await fetchWithActivity("Adding exercise...", "/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: exercise.exerciseName,
          primaryMuscleGroup: exercise.primaryMuscleGroup || "other",
          secondaryMuscleGroups: [],
          equipment: exercise.equipment || null,
          liftCategory: "other",
          defaultIncrementKg: 2.5,
          isMainLift: false,
          isAiSuggestionEnabled: true,
          notes: exercise.notes ?? "Added from AI coach draft.",
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        exercise?: Exercise;
        message?: string;
      } | null;

      if (!response.ok || !body?.exercise) {
        setError(body?.message ?? "Unable to add this exercise.");
        return;
      }

      onExerciseAdded(body.exercise);
      setSelectedExerciseIds((current) => ({
        ...current,
        [index]: body.exercise!.id,
      }));
    } catch {
      setError("Unable to add this exercise. Please try again.");
    } finally {
      setAddingExerciseIndex(null);
    }
  }

  function importCoachDraft() {
    if (!workout) return;
    const nextExercises = workout.exercises.map((exercise, index) => {
      const resolved = resolvedExercise(index, exercise);
      if (!resolved) return null;
      return coachExerciseToPrepared(exercise, resolved, index);
    });

    if (nextExercises.some((exercise) => exercise === null)) {
      setError("Resolve every coach exercise before importing.");
      return;
    }
    if (duplicateResolvedIds > 0) {
      setError("Choose unique exercises before importing.");
      return;
    }

    onImport({
      schemaVersion: 1,
      name: workout.name || "Coach workout",
      sourceTemplateId: null,
      notes: workout.rationale,
      exercises: orderExercises(
        nextExercises.filter((exercise): exercise is PreparedExercise =>
          exercise !== null,
        ),
      ),
    });
    setInstruction("");
    setEnergy("normal");
    setMuscleSoreness("none");
    setAvailableMinutes(45);
    setSubmittedRequest(null);
    setWorkout(null);
    setSelectedExerciseIds({});
    setError(null);
    setIsExpanded(false);
  }

  function clearCoachSuggestion() {
    setSubmittedRequest(null);
    setWorkout(null);
    setSelectedExerciseIds({});
    setError(null);
  }

  function resolvedExercise(index: number, exercise: CoachExercise) {
    const selectedId =
      selectedExerciseIds[index] ??
      (exercise.match.status === "matched" ? exercise.match.exercise?.id : "");
    if (!selectedId) return null;
    return exercises.find((item) => item.id === selectedId) ?? null;
  }

  function duplicateResolvedExerciseIds(current: CoachWorkout) {
    const ids = current.exercises
      .map((exercise, index) => resolvedExercise(index, exercise)?.id)
      .filter((id): id is string => Boolean(id));
    return ids.length - new Set(ids).size;
  }
}

function CoachChoice({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-700">{label}</legend>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-sm">
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={`h-10 rounded-full text-xs font-bold capitalize transition ${
              value === option
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-emerald-50"
            }`}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function emptyDraft(): PreparedDraft {
  return {
    schemaVersion: 1,
    name: "Prepared workout",
    sourceTemplateId: null,
    notes: null,
    exercises: [],
  };
}

function coachExerciseToPrepared(
  coachExercise: CoachExercise,
  exercise: Exercise,
  index: number,
): PreparedExercise {
  const orderedSets = coachExercise.sets.toSorted(
    (left, right) => left.setNumber - right.setNumber,
  );
  const reps = orderedSets.map((set) => set.reps);
  const setWeights = orderedSets.map((set) => set.weightKg);
  const firstWeight = setWeights.find((weight) => weight !== null) ?? null;
  const restSeconds =
    orderedSets.find((set) => typeof set.restSeconds === "number")?.restSeconds ??
    90;
  const exactRepNote = `Coach set reps: ${reps.join("/")}`;
  const setNotes = orderedSets
    .map((set) => set.notes)
    .filter((note): note is string => Boolean(note));
  const notes = [
    coachExercise.notes,
    exactRepNote,
    ...coachExercise.safetyNotes,
    ...setNotes,
  ]
    .filter((note): note is string => Boolean(note))
    .join(" ")
    .slice(0, 1000);

  return {
    id: `draft-${crypto.randomUUID()}`,
    exerciseId: exercise.id,
    exerciseOrder: index + 1,
    targetSets: orderedSets.length,
    targetRepsMin: Math.min(...reps),
    targetRepsMax: Math.max(...reps),
    targetWeightKg: firstWeight,
    targetSetWeightsKg: setWeights,
    restSeconds,
    supersetGroupId: null,
    notes: notes || null,
    exercise,
  };
}

function preferredExerciseOptions(coachExercise: CoachExercise, exercises: Exercise[]) {
  const candidateIds = new Set(coachExercise.match.candidates.map((item) => item.id));
  const candidates = exercises.filter((exercise) => candidateIds.has(exercise.id));
  const remaining = exercises.filter((exercise) => !candidateIds.has(exercise.id));
  return [...candidates, ...remaining];
}

function isCoachWorkout(value: unknown): value is CoachWorkout {
  if (!value || typeof value !== "object") return false;
  const workout = value as Partial<CoachWorkout>;
  return (
    workout.schemaVersion === 1 &&
    typeof workout.name === "string" &&
    Array.isArray(workout.exercises)
  );
}

function isStringRecord(value: unknown): value is Record<number, string> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isCoachInputs(value: unknown): value is CoachInputs {
  if (!value || typeof value !== "object") return false;
  const inputs = value as Partial<CoachInputs>;
  return (
    (inputs.energy === "low" || inputs.energy === "normal" || inputs.energy === "high") &&
    (inputs.muscleSoreness === "none" ||
      inputs.muscleSoreness === "moderate" ||
      inputs.muscleSoreness === "severe") &&
    (inputs.availableMinutes === 15 ||
      inputs.availableMinutes === 30 ||
      inputs.availableMinutes === 45 ||
      inputs.availableMinutes === 60 ||
      inputs.availableMinutes === 75) &&
    typeof inputs.instruction === "string"
  );
}

function parseStoredDraft(
  stored: string,
  exercises: Exercise[],
): { draft: PreparedDraft; droppedMissingExercises: boolean } | null {
  try {
    const parsed = JSON.parse(stored) as Partial<PreparedDraft>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.exercises)) return null;

    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const hydratedExercises = parsed.exercises
      .map((exercise, index) => {
        const exerciseId =
          typeof exercise.exerciseId === "string" ? exercise.exerciseId : "";
        const libraryExercise = exerciseById.get(exerciseId);
        if (!libraryExercise) return null;
        return {
          id:
            typeof exercise.id === "string"
              ? exercise.id
              : `draft-${crypto.randomUUID()}`,
          exerciseId,
          exerciseOrder: index + 1,
          targetSets: clampNumber(exercise.targetSets, 1, 12, 3),
          targetRepsMin: clampNumber(exercise.targetRepsMin, 1, 100, 8),
          targetRepsMax: clampNumber(exercise.targetRepsMax, 1, 100, 12),
          targetWeightKg:
            typeof exercise.targetWeightKg === "number"
              ? Math.max(0, Math.min(1000, exercise.targetWeightKg))
              : null,
          targetSetWeightsKg: Array.isArray(exercise.targetSetWeightsKg)
            ? exercise.targetSetWeightsKg
                .slice(0, 12)
                .map((weight) =>
                  typeof weight === "number"
                    ? Math.max(0, Math.min(1000, weight))
                    : null,
                )
            : [],
          restSeconds: clampNumber(exercise.restSeconds, 0, 900, 90),
          supersetGroupId:
            typeof exercise.supersetGroupId === "string"
              ? exercise.supersetGroupId
              : null,
          notes: typeof exercise.notes === "string" ? exercise.notes : null,
          exercise: libraryExercise,
        };
      })
      .filter((exercise) => exercise !== null);

    return {
      draft: {
        schemaVersion: 1,
        name:
          typeof parsed.name === "string" && parsed.name.trim()
            ? parsed.name
            : "Prepared workout",
        sourceTemplateId:
          typeof parsed.sourceTemplateId === "string"
            ? parsed.sourceTemplateId
            : null,
        notes: typeof parsed.notes === "string" ? parsed.notes : null,
        exercises: orderExercises(hydratedExercises),
      },
      droppedMissingExercises: hydratedExercises.length !== parsed.exercises.length,
    };
  } catch {
    return null;
  }
}

function serializeDraft(draft: PreparedDraft) {
  return {
    schemaVersion: draft.schemaVersion,
    name: draft.name,
    sourceTemplateId: draft.sourceTemplateId,
    notes: draft.notes,
    exercises: draft.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseOrder: exercise.exerciseOrder,
      targetSets: exercise.targetSets,
      targetRepsMin: exercise.targetRepsMin,
      targetRepsMax: exercise.targetRepsMax,
      targetWeightKg: exercise.targetWeightKg,
      targetSetWeightsKg: exercise.targetSetWeightsKg,
      restSeconds: exercise.restSeconds,
      supersetGroupId: exercise.supersetGroupId,
      notes: exercise.notes,
    })),
  };
}

function orderExercises(exercises: PreparedExercise[]) {
  const ordered = exercises.map((exercise, index) => ({
    ...exercise,
    exerciseOrder: index + 1,
  }));
  const validGroupIds = new Set(
    [...new Set(ordered.map((exercise) => exercise.supersetGroupId))]
      .filter((groupId): groupId is string => Boolean(groupId))
      .filter((groupId) => {
        const members = ordered.filter(
          (exercise) => exercise.supersetGroupId === groupId,
        );
        return (
          members.length === 2 &&
          Math.abs(members[0].exerciseOrder - members[1].exerciseOrder) === 1 &&
          members[0].targetSets === members[1].targetSets &&
          members[0].restSeconds === members[1].restSeconds
        );
      }),
  );

  return ordered.map((exercise) =>
    exercise.supersetGroupId && !validGroupIds.has(exercise.supersetGroupId)
      ? { ...exercise, supersetGroupId: null }
      : exercise,
  );
}

function resizeSetWeights(
  setWeights: Array<number | null>,
  targetSets: number,
  fallbackWeightKg: number | null,
) {
  return Array.from(
    { length: targetSets },
    (_, index) => setWeights[index] ?? fallbackWeightKg ?? null,
  );
}

function getSetWeightValue(exercise: PreparedExercise, setIndex: number) {
  return exercise.targetSetWeightsKg[setIndex] ?? exercise.targetWeightKg ?? 0;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return typeof value === "number"
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(value);
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
      {label}
      <input
        className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-base font-bold normal-case tracking-normal tabular-nums"
        min={0}
        step={step}
        type="number"
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
