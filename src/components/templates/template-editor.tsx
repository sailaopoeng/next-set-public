"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Plus, Save, Trash2, X } from "lucide-react";

import { useAppActivity, useTrackedRouter } from "@/components/ui/app-activity";
import { Button } from "@/components/ui/button";
import { SortableList } from "@/components/ui/sortable-list";
import type { Exercise, TemplateExercise, WorkoutTemplate } from "@/lib/domain";
import { buildSupersetBlocks, type SupersetBlock } from "@/lib/supersets";

type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
};

export function TemplateEditor({
  template,
  exercises,
}: {
  template: TemplateWithExercises;
  exercises: Exercise[];
}) {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [draft, setDraft] = useState(template);
  const [exerciseToAddId, setExerciseToAddId] = useState(exercises[0]?.id ?? "");
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [exerciseAdded, setExerciseAdded] = useState(false);
  const exerciseAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const filteredExercises = useMemo(() => {
    const query = exerciseFilter.trim().toLowerCase();
    return query
      ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(query))
      : exercises;
  }, [exerciseFilter, exercises]);
  const selectedExerciseToAddId =
    filteredExercises.find((exercise) => exercise.id === exerciseToAddId)?.id ??
    filteredExercises[0]?.id ??
    "";
  const exerciseBlocks = buildSupersetBlocks(
    draft.workout_template_exercises,
    (exercise) => exercise.superset_group_id,
  );

  useEffect(() => {
    return () => {
      if (exerciseAddedTimeoutRef.current) {
        clearTimeout(exerciseAddedTimeoutRef.current);
      }
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetchWithActivity(
        "Saving template...",
        "/api/templates",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draft.id,
            name: draft.name,
            description: draft.description,
            sortOrder: draft.sort_order,
            isActive: draft.is_active,
            exercises: draft.workout_template_exercises.map((exercise, index) => ({
              exerciseId: exercise.exercise_id,
              exerciseOrder: index + 1,
              targetSets: exercise.target_sets,
              targetRepsMin: exercise.target_reps_min,
              targetRepsMax: exercise.target_reps_max,
              targetWeightKg: exercise.target_weight_kg,
              targetSetWeightsKg: normalizeSetWeights(exercise),
              restSeconds: exercise.rest_seconds,
              supersetGroupId: exercise.superset_group_id,
              notes: exercise.notes,
            })),
          }),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setSaveError(body?.message ?? "Unable to save template. Please try again.");
        return;
      }

      router.refresh();
    } catch {
      setSaveError("Unable to save template. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-bold text-slate-700">
          Template name
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="mt-4 block text-sm font-bold text-slate-700">
          Notes
          <textarea
            className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            value={draft.description ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value || null })
            }
          />
        </label>
      </section>

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
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
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
            variant="secondary"
          >
            {exerciseAdded ? <Check size={16} /> : <Plus size={16} />}
            {exerciseAdded ? "Added" : "Add"}
          </Button>
        </div>
      </section>

      <SortableList
        disabled={saving}
        getLabel={(block) => block.items.map((item) => item.exercise.name).join(" and ")}
        items={exerciseBlocks}
        onReorder={(blocks) => reorderExercises(blocks.flatMap((block) => block.items))}
        renderItem={(block, handle, compact) => {
          if (compact) {
            return (
              <div className="flex h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-lg">
                {handle}
                <span className="truncate font-bold">
                  {block.items.map((item) => item.exercise.name).join(" + ")}
                </span>
              </div>
            );
          }

          return renderExerciseBlock(block, handle);
        }}
      />

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 md:bottom-4">
        {saveError ? (
          <p
            className="mb-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 shadow-sm"
            role="alert"
          >
            {saveError}
          </p>
        ) : null}
        <Button
          onClick={save}
          disabled={saving || draft.workout_template_exercises.length === 0}
          className="h-12 w-full shadow-lg"
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save template"}
        </Button>
      </div>
    </div>
  );

  function renderExerciseBlock(
    block: SupersetBlock<TemplateExercise & { exercise: Exercise }>,
    handle: ReactNode,
  ) {
    return (
      <section className={`rounded-2xl border bg-white p-3 shadow-sm ${block.groupId ? "border-emerald-300" : "border-slate-200"}`}>
        <div className="mb-2 flex items-center gap-2">
          {handle}
          <span className={`text-xs font-extrabold uppercase tracking-wide ${block.groupId ? "text-emerald-700" : "text-slate-400"}`}>
            {block.groupId ? "Superset" : "Exercise"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {block.groupId ? (
              <>
                <NumberField
                  label="Rest after round"
                  value={block.items[0].rest_seconds}
                  onChange={(value) => updateSupersetRest(block.groupId as string, value)}
                />
                <Button onClick={() => removeSuperset(block.groupId as string)} variant="ghost">
                  Remove superset
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <div className={block.groupId ? "space-y-3" : ""}>
          {block.items.map((exercise, blockIndex) => {
            const index = draft.workout_template_exercises.findIndex((item) => item.id === exercise.id);
            return (
              <div className={block.groupId ? "rounded-xl bg-emerald-50/50 p-3" : "p-1"} key={exercise.id}>
                <div className="mb-3 flex items-start gap-2">
                  {block.groupId ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-xs font-extrabold text-white">
                      {blockIndex === 0 ? "A" : "B"}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <select
                      aria-label="Exercise"
                      className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-bold text-slate-950"
                      value={exercise.exercise_id}
                      onChange={(event) => changeExercise(index, event.target.value)}
                    >
                      {exercises.map((libraryExercise) => (
                        <option key={libraryExercise.id} value={libraryExercise.id}>{libraryExercise.name}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs font-medium text-slate-500">
                      {exercise.exercise.primary_muscle_group} / {exercise.exercise.equipment ?? "equipment optional"}
                    </p>
                  </div>
                  <Button
                    aria-label={`Remove ${exercise.exercise.name}`}
                    className="min-h-10 px-2.5"
                    disabled={draft.workout_template_exercises.length <= 1}
                    onClick={() => removeExercise(index)}
                    variant="ghost"
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
                <div className={`grid grid-cols-2 gap-2 ${block.groupId ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}>
                  <NumberField label="Sets" value={exercise.target_sets} onChange={(value) => updateSetCount(index, value)} />
                  <NumberField label="Rep min" value={exercise.target_reps_min} onChange={(value) => updateExercise(index, "target_reps_min", value)} />
                  <NumberField label="Rep max" value={exercise.target_reps_max} onChange={(value) => updateExercise(index, "target_reps_max", value)} />
                  <NumberField label="Default kg" value={exercise.target_weight_kg ?? 0} onChange={(value) => updateDefaultWeight(index, value)} />
                  {!block.groupId ? <NumberField label="Rest" value={exercise.rest_seconds} onChange={(value) => updateExercise(index, "rest_seconds", value)} /> : null}
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Set weights</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {Array.from({ length: exercise.target_sets }, (_, setIndex) => (
                      <NumberField key={setIndex} label={`Set ${setIndex + 1} kg`} value={getSetWeightValue(exercise, setIndex)} onChange={(value) => updateSetWeight(index, setIndex, value)} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!block.groupId ? renderPairButton(block.items[0]) : null}
      </section>
    );
  }

  function renderPairButton(exercise: TemplateExercise) {
    const index = draft.workout_template_exercises.findIndex((item) => item.id === exercise.id);
    const next = draft.workout_template_exercises[index + 1];
    if (!next || next.superset_group_id || next.target_sets !== exercise.target_sets) return null;
    return (
      <Button className="mt-3 w-full" onClick={() => createSuperset(index)} variant="secondary">
        Superset with next
      </Button>
    );
  }

  function updateExercise(
    index: number,
    key: keyof TemplateExercise,
    value: number | string | Array<number | null> | null,
  ) {
    const templateExercises = [...draft.workout_template_exercises];
    templateExercises[index] = { ...templateExercises[index], [key]: value };
    setDraft({ ...draft, workout_template_exercises: templateExercises });
  }

  function updateSetCount(index: number, targetSets: number) {
    const clampedSets = Math.max(1, Math.min(12, targetSets));
    const templateExercises = [...draft.workout_template_exercises];
    const exercise = templateExercises[index];
    const groupId = exercise.superset_group_id;
    templateExercises.forEach((item, itemIndex) => {
      if (itemIndex === index || (groupId && item.superset_group_id === groupId)) {
        templateExercises[itemIndex] = {
          ...item,
          target_sets: clampedSets,
          target_set_weights_kg: resizeSetWeights(item, clampedSets),
        };
      }
    });
    setDraft({ ...draft, workout_template_exercises: templateExercises });
  }

  function updateSetWeight(
    exerciseIndex: number,
    setIndex: number,
    weightKg: number,
  ) {
    const templateExercises = [...draft.workout_template_exercises];
    const exercise = templateExercises[exerciseIndex];
    const setWeights = resizeSetWeights(exercise, exercise.target_sets);
    setWeights[setIndex] = weightKg;
    templateExercises[exerciseIndex] = {
      ...exercise,
      target_set_weights_kg: setWeights,
    };
    setDraft({ ...draft, workout_template_exercises: templateExercises });
  }

  function updateDefaultWeight(index: number, weightKg: number) {
    const templateExercises = [...draft.workout_template_exercises];
    const exercise = templateExercises[index];
    const previousDefault = exercise.target_weight_kg ?? 0;
    const setWeights = resizeSetWeights(exercise, exercise.target_sets);
    const shouldUpdateSetWeights = setWeights.every(
      (setWeight) => (setWeight ?? 0) === previousDefault,
    );
    templateExercises[index] = {
      ...exercise,
      target_weight_kg: weightKg,
      target_set_weights_kg: shouldUpdateSetWeights
        ? Array.from({ length: exercise.target_sets }, () => weightKg)
        : setWeights,
    };
    setDraft({ ...draft, workout_template_exercises: templateExercises });
  }

  function changeExercise(index: number, exerciseId: string) {
    const selectedExercise = exercises.find((exercise) => exercise.id === exerciseId);
    if (!selectedExercise) return;

    const templateExercises = [...draft.workout_template_exercises];
    templateExercises[index] = {
      ...templateExercises[index],
      exercise_id: selectedExercise.id,
      exercise: selectedExercise,
    };
    setDraft({ ...draft, workout_template_exercises: templateExercises });
  }

  function addExercise() {
    const selectedExercise = exercises.find(
      (exercise) => exercise.id === selectedExerciseToAddId,
    );
    if (!selectedExercise) return;

    const templateExercises = [
      ...draft.workout_template_exercises,
      {
        id: `draft-${crypto.randomUUID()}`,
        template_id: draft.id,
        exercise_id: selectedExercise.id,
        exercise_order: draft.workout_template_exercises.length + 1,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        target_weight_kg: 0,
        target_set_weights_kg: [0, 0, 0],
        rest_seconds: 90,
        superset_group_id: null,
        notes: null,
        exercise: selectedExercise,
      },
    ];
    setDraft({ ...draft, workout_template_exercises: templateExercises });
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
    const removedGroupId = draft.workout_template_exercises[index]?.superset_group_id;
    const templateExercises = draft.workout_template_exercises
      .filter((_, exerciseIndex) => exerciseIndex !== index)
      .map((exercise, exerciseIndex) => ({
        ...exercise,
        exercise_order: exerciseIndex + 1,
        superset_group_id:
          removedGroupId && exercise.superset_group_id === removedGroupId
            ? null
            : exercise.superset_group_id,
      }));
    setDraft({ ...draft, workout_template_exercises: templateExercises });
  }

  function reorderExercises(
    templateExercises: Array<TemplateExercise & { exercise: Exercise }>,
  ) {
    setDraft({
      ...draft,
      workout_template_exercises: templateExercises.map((exercise, index) => ({
        ...exercise,
        exercise_order: index + 1,
      })),
    });
  }

  function createSuperset(index: number) {
    const groupId = crypto.randomUUID();
    const restSeconds = draft.workout_template_exercises[index + 1].rest_seconds;
    setDraft({
      ...draft,
      workout_template_exercises: draft.workout_template_exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index || exerciseIndex === index + 1
          ? { ...exercise, superset_group_id: groupId, rest_seconds: restSeconds }
          : exercise,
      ),
    });
  }

  function removeSuperset(groupId: string) {
    setDraft({
      ...draft,
      workout_template_exercises: draft.workout_template_exercises.map((exercise) =>
        exercise.superset_group_id === groupId
          ? { ...exercise, superset_group_id: null }
          : exercise,
      ),
    });
  }

  function updateSupersetRest(groupId: string, restSeconds: number) {
    setDraft({
      ...draft,
      workout_template_exercises: draft.workout_template_exercises.map((exercise) =>
        exercise.superset_group_id === groupId
          ? { ...exercise, rest_seconds: restSeconds }
          : exercise,
      ),
    });
  }
}

function getSetWeightValue(
  exercise: TemplateExercise,
  setIndex: number,
): number {
  return exercise.target_set_weights_kg[setIndex] ?? exercise.target_weight_kg ?? 0;
}

function normalizeSetWeights(exercise: TemplateExercise): Array<number | null> {
  return resizeSetWeights(exercise, exercise.target_sets);
}

function resizeSetWeights(
  exercise: TemplateExercise,
  targetSets: number,
): Array<number | null> {
  return Array.from(
    { length: targetSets },
    (_, index) =>
      exercise.target_set_weights_kg[index] ?? exercise.target_weight_kg ?? null,
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
      {label}
      <input
        className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-base font-bold normal-case tracking-normal tabular-nums"
        type="number"
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
