import type { SupabaseClient } from "@supabase/supabase-js";

import starterExercises from "@/data/starter-exercises.json";
import starterTemplates from "@/data/starter-workout-templates.json";
import type { LiftCategory } from "@/lib/domain";

type StarterTemplate = (typeof starterTemplates)[number];

type FreeExerciseDbExercise = {
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
  instructions?: string[];
};

const FREE_EXERCISE_DB_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

export async function importStarterData(
  supabase: SupabaseClient,
  userId: string,
) {
  const exerciseResult = await importExercises(
    supabase,
    userId,
    starterExercises.map((exercise) => ({
      ...exercise,
      source: "nextset_starter",
      sourceId: slugify(exercise.name),
      sourceUrl: null,
      sourceLicense: "NextSet starter data",
      sourcePayload: exercise,
      liftCategory: exercise.liftCategory as LiftCategory,
      isAiSuggestionEnabled: true,
    })),
  );

  const templateResult = await importTemplates(supabase, userId, starterTemplates);

  return {
    exercises: exerciseResult,
    templates: templateResult,
  };
}

export async function importFreeExerciseDb(
  supabase: SupabaseClient,
  userId: string,
) {
  const response = await fetch(FREE_EXERCISE_DB_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Exercise library fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as FreeExerciseDbExercise[];
  const exercises = payload
    .filter((exercise) => exercise.category === "strength")
    .map((exercise) => normalizeFreeExercise(exercise));

  return importExercises(supabase, userId, exercises);
}

async function importExercises(
  supabase: SupabaseClient,
  userId: string,
  exercises: Array<NormalizedExercise>,
) {
  let inserted = 0;
  let updated = 0;

  for (const exercise of exercises) {
    const { data: existing, error: findError } = await supabase
      .from("exercises")
      .select("id")
      .eq("user_id", userId)
      .eq("source", exercise.source)
      .eq("source_id", exercise.sourceId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    const row = {
      user_id: userId,
      name: exercise.name,
      primary_muscle_group: exercise.primaryMuscleGroup,
      secondary_muscle_groups: exercise.secondaryMuscleGroups,
      equipment: exercise.equipment,
      lift_category: exercise.liftCategory,
      default_increment_kg: exercise.defaultIncrementKg,
      is_main_lift: exercise.isMainLift,
      notes: exercise.notes,
      source: exercise.source,
      source_id: exercise.sourceId,
      source_url: exercise.sourceUrl,
      source_license: exercise.sourceLicense,
      source_payload: exercise.sourcePayload,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("exercises")
        .update(row)
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase.from("exercises").insert({
        ...row,
        is_ai_suggestion_enabled: exercise.isAiSuggestionEnabled,
      });
      if (error) throw error;
      inserted += 1;
    }
  }

  return { inserted, updated };
}

async function importTemplates(
  supabase: SupabaseClient,
  userId: string,
  templates: StarterTemplate[],
) {
  let createdOrUpdated = 0;

  for (const template of templates) {
    const { data: existing, error: findError } = await supabase
      .from("workout_templates")
      .select("id")
      .eq("user_id", userId)
      .eq("name", template.name)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    const templateRow = {
      user_id: userId,
      name: template.name,
      description: template.description,
      sort_order: template.sortOrder,
      is_active: true,
    };

    const templateId = existing?.id ?? crypto.randomUUID();

    if (existing?.id) {
      const { error } = await supabase
        .from("workout_templates")
        .update(templateRow)
        .eq("id", templateId)
        .eq("user_id", userId);
      if (error) throw error;

      const { error: deleteError } = await supabase
        .from("workout_template_exercises")
        .delete()
        .eq("template_id", templateId)
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
    } else {
      const { error } = await supabase
        .from("workout_templates")
        .insert({ ...templateRow, id: templateId });
      if (error) throw error;
    }

    await insertTemplateExercises(supabase, userId, templateId, template);
    createdOrUpdated += 1;
  }

  return { createdOrUpdated };
}

async function insertTemplateExercises(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  template: StarterTemplate,
) {
  const names = template.exercises.map((exercise) => exercise.name);
  const { data: exercises, error } = await supabase
    .from("exercises")
    .select("id,name")
    .eq("user_id", userId)
    .in("name", names);

  if (error) {
    throw error;
  }

  const byName = new Map(
    (exercises ?? []).map((exercise: { id: string; name: string }) => [
      exercise.name,
      exercise.id,
    ]),
  );

  const rows = template.exercises.map((exercise, index) => {
    const exerciseId = byName.get(exercise.name);

    if (!exerciseId) {
      throw new Error(`Missing starter exercise: ${exercise.name}`);
    }

    return {
      user_id: userId,
      template_id: templateId,
      exercise_id: exerciseId,
      exercise_order: index + 1,
      target_sets: exercise.targetSets,
      target_reps_min: exercise.targetRepsMin,
      target_reps_max: exercise.targetRepsMax,
      target_weight_kg: exercise.targetWeightKg,
      target_set_weights_kg: getStarterSetWeights(exercise),
      rest_seconds: exercise.restSeconds,
      notes: exercise.notes,
    };
  });

  const { error: insertError } = await supabase
    .from("workout_template_exercises")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

type NormalizedExercise = {
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string | null;
  liftCategory: LiftCategory;
  defaultIncrementKg: number;
  isMainLift: boolean;
  notes: string | null;
  source: string;
  sourceId: string;
  sourceUrl: string | null;
  sourceLicense: string;
  sourcePayload: unknown;
  isAiSuggestionEnabled: boolean;
};

function normalizeFreeExercise(exercise: FreeExerciseDbExercise): NormalizedExercise {
  const primary = normalizeMuscle(exercise.primaryMuscles[0] ?? "other");
  const equipment = exercise.equipment?.trim() || null;
  const liftCategory = inferLiftCategory(exercise.name, equipment, primary);

  return {
    name: exercise.name,
    primaryMuscleGroup: primary,
    secondaryMuscleGroups: exercise.secondaryMuscles.map(normalizeMuscle),
    equipment,
    liftCategory,
    defaultIncrementKg: defaultIncrement(liftCategory),
    isMainLift: isMainLift(exercise.name),
    notes: exercise.instructions?.slice(0, 3).join(" ") ?? null,
    source: "free_exercise_db",
    sourceId: exercise.id,
    sourceUrl: `https://github.com/yuhonas/free-exercise-db/tree/main/exercises/${exercise.id}`,
    sourceLicense: "Unlicense",
    sourcePayload: exercise,
    isAiSuggestionEnabled: false,
  };
}

function normalizeMuscle(muscle: string): string {
  const value = muscle.toLowerCase();

  if (["abdominals"].includes(value)) return "core";
  if (["quadriceps"].includes(value)) return "quads";
  if (["middle back", "lower back", "lats", "traps"].includes(value)) {
    return "back";
  }

  return value;
}

function inferLiftCategory(
  name: string,
  equipment: string | null,
  primary: string,
): LiftCategory {
  const lowerName = name.toLowerCase();
  const lowerEquipment = equipment?.toLowerCase() ?? "";

  if (lowerEquipment.includes("barbell") && primary !== "quads") {
    return lowerName.includes("squat") || lowerName.includes("deadlift")
      ? "lower_compound"
      : "barbell_upper";
  }

  if (lowerEquipment.includes("dumbbell")) return "dumbbell_upper";
  if (lowerEquipment.includes("machine") || lowerEquipment.includes("cable")) {
    return "machine";
  }
  if (lowerEquipment.includes("body")) return "bodyweight";
  if (["quads", "hamstrings", "glutes"].includes(primary)) {
    return "lower_compound";
  }
  if (primary === "core") return "core";

  return "other";
}

function defaultIncrement(liftCategory: LiftCategory): number {
  if (liftCategory === "lower_compound") return 5;
  if (liftCategory === "dumbbell_upper") return 2;
  if (liftCategory === "barbell_upper" || liftCategory === "machine") return 2.5;
  return 1;
}

function isMainLift(name: string): boolean {
  return /squat|deadlift|bench press|overhead press|barbell row/i.test(name);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getStarterSetWeights(exercise: StarterTemplate["exercises"][number]) {
  if (
    "targetSetWeightsKg" in exercise &&
    Array.isArray(exercise.targetSetWeightsKg)
  ) {
    return exercise.targetSetWeightsKg;
  }

  return [];
}
