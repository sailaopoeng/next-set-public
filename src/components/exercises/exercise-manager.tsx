"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";

import {
  AppLink,
  useAppActivity,
  useTrackedRouter,
} from "@/components/ui/app-activity";
import { Button } from "@/components/ui/button";
import { ImportFullExerciseLibraryButton } from "@/components/ui/action-buttons";
import type { Exercise, LiftCategory } from "@/lib/domain";

type ExerciseDraft = {
  name: string;
  primaryMuscleGroup: string;
  equipment: string;
  liftCategory: LiftCategory;
  isAiSuggestionEnabled: boolean;
};

const liftCategories: Array<{ value: LiftCategory; label: string }> = [
  { value: "barbell_upper", label: "Barbell upper" },
  { value: "dumbbell_upper", label: "Dumbbell upper" },
  { value: "lower_compound", label: "Lower compound" },
  { value: "machine", label: "Machine" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "accessory", label: "Accessory" },
  { value: "core", label: "Core" },
  { value: "conditioning", label: "Conditioning" },
  { value: "other", label: "Other" },
];

const emptyDraft: ExerciseDraft = {
  name: "",
  primaryMuscleGroup: "chest",
  equipment: "",
  liftCategory: "other",
  isAiSuggestionEnabled: true,
};

export function ExerciseManager({
  exercises,
  readOnly = false,
}: {
  exercises: Exercise[];
  readOnly?: boolean;
}) {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingExerciseId, setSavingExerciseId] = useState<string | null>(null);
  const [togglingExerciseId, setTogglingExerciseId] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<ExerciseDraft>(emptyDraft);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ExerciseDraft>(emptyDraft);
  const filtered = useMemo(
    () =>
      exercises.filter((exercise) =>
        `${exercise.name} ${exercise.primary_muscle_group}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [exercises, query],
  );

  async function addExercise() {
    setSaving(true);
    await saveExercise(addDraft);
    setSaving(false);
    setAddDraft(emptyDraft);
  }

  async function updateExercise(exerciseId: string) {
    setSavingExerciseId(exerciseId);
    await saveExercise(editDraft, exerciseId);
    setSavingExerciseId(null);
    setEditingExerciseId(null);
  }

  async function saveExercise(draft: ExerciseDraft, exerciseId?: string) {
    await fetchWithActivity(
      exerciseId ? "Saving exercise..." : "Adding exercise...",
      "/api/exercises",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(exerciseId ? { id: exerciseId } : {}),
          name: draft.name,
          primaryMuscleGroup: draft.primaryMuscleGroup,
          secondaryMuscleGroups: [],
          equipment: draft.equipment || null,
          liftCategory: draft.liftCategory,
          defaultIncrementKg: draft.liftCategory === "lower_compound" ? 5 : 2.5,
          isMainLift: false,
          isAiSuggestionEnabled: draft.isAiSuggestionEnabled,
          notes: null,
        }),
      },
    );
    router.refresh();
  }

  async function toggleAiSuggestions(exercise: Exercise) {
    setTogglingExerciseId(exercise.id);
    try {
      await fetchWithActivity(
        exercise.is_ai_suggestion_enabled
          ? "Removing from AI suggestions..."
          : "Allowing in AI suggestions...",
        `/api/exercises/${exercise.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isAiSuggestionEnabled: !exercise.is_ai_suggestion_enabled,
          }),
        },
      );
      router.refresh();
    } finally {
      setTogglingExerciseId(null);
    }
  }

  return (
    <div className={readOnly ? "" : "grid gap-4 lg:grid-cols-[0.85fr_1.15fr]"}>
      {!readOnly ? (
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
          <h2 className="text-base font-bold">Add exercise</h2>
          <div className="mt-4 space-y-2.5">
            <ExerciseFields draft={addDraft} onChange={setAddDraft} />
            <Button
              onClick={addExercise}
              disabled={!addDraft.name || saving}
              className="w-full"
            >
              <Plus size={16} />
              {saving ? "Adding..." : "Add"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Library</h2>
            <p className="text-sm text-slate-600">
              {readOnly
                ? "Read-only exercise library and muscle metadata."
                : "Starter data is editable. Full import uses free-exercise-db."}
            </p>
          </div>
          {!readOnly ? <ImportFullExerciseLibraryButton /> : null}
        </div>
        <div className="relative mb-3">
          <input
            className="h-12 w-full rounded-xl border border-slate-300 px-3 pr-12"
            placeholder="Search exercises"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              aria-label="Clear exercise search"
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-900"
              onClick={() => setQuery("")}
              type="button"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
        <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
          {filtered.map((exercise) =>
            editingExerciseId === exercise.id ? (
              <div
                className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3"
                key={exercise.id}
              >
                <ExerciseFields draft={editDraft} onChange={setEditDraft} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => updateExercise(exercise.id)}
                    disabled={!editDraft.name || savingExerciseId === exercise.id}
                  >
                    <Check size={16} />
                    {savingExerciseId === exercise.id ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    onClick={() => setEditingExerciseId(null)}
                    variant="secondary"
                  >
                    <X size={16} />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl bg-slate-50 p-3"
                key={exercise.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <AppLink
                      className="block rounded-md hover:text-emerald-700"
                      href={`/exercises/${exercise.id}`}
                    >
                      <div className="font-bold">{exercise.name}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">
                        {exercise.primary_muscle_group} /{" "}
                        {exercise.equipment ?? "equipment optional"} /{" "}
                        {exercise.lift_category}
                      </div>
                    </AppLink>
                    {!readOnly ? (
                      <button
                        aria-checked={exercise.is_ai_suggestion_enabled}
                        className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          exercise.is_ai_suggestion_enabled
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-500"
                        }`}
                        disabled={togglingExerciseId === exercise.id}
                        onClick={() => toggleAiSuggestions(exercise)}
                        role="switch"
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            exercise.is_ai_suggestion_enabled
                              ? "bg-emerald-600"
                              : "bg-slate-400"
                          }`}
                        />
                        AI suggestions:{" "}
                        {exercise.is_ai_suggestion_enabled ? "On" : "Off"}
                      </button>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <Button
                      aria-label={`Edit ${exercise.name}`}
                      className="min-h-9 px-2.5"
                      onClick={() => {
                        setEditingExerciseId(exercise.id);
                        setEditDraft(toDraft(exercise));
                      }}
                      variant="ghost"
                    >
                      <Pencil size={15} />
                    </Button>
                  ) : null}
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function ExerciseFields({
  draft,
  onChange,
}: {
  draft: ExerciseDraft;
  onChange: (draft: ExerciseDraft) => void;
}) {
  return (
    <div className="space-y-2.5">
      <input
        className="h-12 w-full rounded-xl border border-slate-300 px-3"
        placeholder="Exercise name"
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      <input
        className="h-12 w-full rounded-xl border border-slate-300 px-3"
        placeholder="Primary muscle group"
        value={draft.primaryMuscleGroup}
        onChange={(event) =>
          onChange({ ...draft, primaryMuscleGroup: event.target.value })
        }
      />
      <input
        className="h-12 w-full rounded-xl border border-slate-300 px-3"
        placeholder="Equipment"
        value={draft.equipment}
        onChange={(event) => onChange({ ...draft, equipment: event.target.value })}
      />
      <select
        className="h-12 w-full rounded-xl border border-slate-300 px-3"
        value={draft.liftCategory}
        onChange={(event) =>
          onChange({ ...draft, liftCategory: event.target.value as LiftCategory })
        }
      >
        {liftCategories.map((category) => (
          <option key={category.value} value={category.value}>
            {category.label}
          </option>
        ))}
      </select>
      <label className="flex items-center justify-between rounded-xl border border-slate-300 p-3 text-sm font-semibold">
        <span>Allow in AI suggestions</span>
        <input
          checked={draft.isAiSuggestionEnabled}
          className="h-4 w-4"
          onChange={(event) =>
            onChange({
              ...draft,
              isAiSuggestionEnabled: event.target.checked,
            })
          }
          type="checkbox"
        />
      </label>
    </div>
  );
}

function toDraft(exercise: Exercise): ExerciseDraft {
  return {
    name: exercise.name,
    primaryMuscleGroup: exercise.primary_muscle_group,
    equipment: exercise.equipment ?? "",
    liftCategory: exercise.lift_category,
    isAiSuggestionEnabled: exercise.is_ai_suggestion_enabled,
  };
}
