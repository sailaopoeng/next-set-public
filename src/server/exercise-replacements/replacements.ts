import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalMuscleGroup } from "@/lib/muscle-groups";
import type {
  Exercise,
  SessionWithDetails,
  TemplateExercise,
  WorkoutTemplate,
} from "@/lib/domain";
import type { z } from "zod";
import type { suggestedTargetSchema } from "@/lib/validation/schemas";
import {
  listCompletedSessionDetails,
  listExercises,
  listTemplates,
} from "@/server/db/queries";
import { recommendProgression } from "@/server/progression/rules";
import { GEMINI_BASE_URL, getGeminiModel } from "@/server/ai/models";

const AI_TIMEOUT_MS = 1200;
const RESULT_LIMIT = 4;

type SuggestedTarget = z.infer<typeof suggestedTargetSchema>;
type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
};

export type ExerciseReplacementCandidate = {
  exercise: Exercise;
  target: SuggestedTarget;
  reasonTags: string[];
  score: number;
};

export type ExerciseReplacementInput = {
  sourceExerciseId: string;
  excludeExerciseIds: string[];
  seenExerciseIds: string[];
  currentTarget: SuggestedTarget;
  contextType: "session" | "suggestion" | "prep";
};

export async function findExerciseReplacements(
  supabase: SupabaseClient,
  userId: string,
  input: ExerciseReplacementInput,
) {
  const [exercises, templates, history] = await Promise.all([
    listExercises(supabase, userId),
    listTemplates(supabase, userId),
    listCompletedSessionDetails(supabase, userId, 20),
  ]);
  const source = exercises.find((exercise) => exercise.id === input.sourceExerciseId);

  if (!source) {
    throw new Error("Source exercise does not belong to this user.");
  }

  const excludedIds = new Set([
    input.sourceExerciseId,
    ...input.excludeExerciseIds,
    ...input.seenExerciseIds,
  ]);
  const sourcePrimary = canonicalMuscleGroup(source.primary_muscle_group);
  const ranked = exercises
    .filter((exercise) => {
      if (excludedIds.has(exercise.id)) return false;
      return canonicalMuscleGroup(exercise.primary_muscle_group) === sourcePrimary;
    })
    .map((exercise) =>
      scoreCandidate(exercise, source, input.currentTarget, templates, history),
    )
    .filter((candidate) => candidate.score > 0)
    .toSorted((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.exercise.name.localeCompare(right.exercise.name);
    })
    .slice(0, 12);

  const reranked = await maybeRerankWithAi(source, ranked).catch(() => ranked);
  return reranked.slice(0, RESULT_LIMIT);
}

function scoreCandidate(
  exercise: Exercise,
  source: Exercise,
  currentTarget: SuggestedTarget,
  templates: TemplateWithExercises[],
  history: SessionWithDetails[],
): ExerciseReplacementCandidate {
  const reasonTags: string[] = ["same muscle"];
  let score = 100;

  const sourceSecondary = source.secondary_muscle_groups.map(canonicalMuscleGroup);
  const secondaryOverlap = exercise.secondary_muscle_groups
    .map(canonicalMuscleGroup)
    .filter((muscle) => sourceSecondary.includes(muscle)).length;
  score += secondaryOverlap * 8;
  if (secondaryOverlap > 0) reasonTags.push("similar secondary work");

  if (normalized(exercise.equipment) === normalized(source.equipment)) {
    score += 18;
    reasonTags.push("same equipment");
  } else if (isCommonEquipment(exercise.equipment)) {
    score += 6;
  } else {
    score -= 12;
  }

  if (exercise.lift_category === source.lift_category) {
    score += 12;
    reasonTags.push("similar lift");
  }
  if (exercise.is_ai_suggestion_enabled) {
    score += 10;
    reasonTags.push("trusted");
  }
  if (exercise.is_main_lift === source.is_main_lift) score += 5;

  const templateMatch = templates
    .flatMap((template) => template.workout_template_exercises)
    .find((entry) => entry.exercise_id === exercise.id);
  if (templateMatch) {
    score += 12;
    reasonTags.push("in templates");
  }

  const previousSession = history.find((session) =>
    session.session_exercises.some((item) => item.exercise_id === exercise.id),
  );
  const previous = previousSession?.session_exercises.find((item) => item.exercise_id === exercise.id);
  if (previous) {
    score += 18;
    reasonTags.push("from history");
  }

  score += commonNameScore(exercise.name);

  return {
    exercise,
    target: buildReplacementTarget(exercise, currentTarget, templateMatch, previous, previousSession?.notes),
    reasonTags,
    score,
  };
}

function buildReplacementTarget(
  exercise: Exercise,
  currentTarget: SuggestedTarget,
  templateMatch: (TemplateExercise & { exercise: Exercise }) | undefined,
  previous: SessionWithDetails["session_exercises"][number] | undefined,
  sessionNotes?: string | null,
): SuggestedTarget {
  if (previous) {
    return recommendProgression({
      sessionExercise: previous,
      sets: previous.session_sets,
      sessionNotes,
    }).suggestedTarget;
  }

  if (templateMatch) {
    return {
      sets: templateMatch.target_sets,
      repsMin: templateMatch.target_reps_min,
      repsMax: templateMatch.target_reps_max,
      weightKg: templateMatch.target_weight_kg,
      restSeconds: templateMatch.rest_seconds,
      notes: templateMatch.notes,
    };
  }

  return {
    ...currentTarget,
    weightKg: comparableTargetWeight(exercise, currentTarget),
    notes: currentTarget.notes,
  };
}

function comparableTargetWeight(exercise: Exercise, target: SuggestedTarget) {
  if (target.weightKg === null) return null;
  if (exercise.lift_category === "bodyweight" || exercise.lift_category === "core") {
    return 0;
  }
  return target.weightKg;
}

async function maybeRerankWithAi(
  source: Exercise,
  candidates: ExerciseReplacementCandidate[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || candidates.length < RESULT_LIMIT) return candidates;

  const model = getGeminiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Rank these existing exercise replacement ids for a normal gym lifter. Keep common, practical choices first. Return JSON only: {"exerciseIds":["uuid"]}.
Source: ${JSON.stringify(source)}
Candidates: ${JSON.stringify(
                    candidates.map((candidate) => ({
                      id: candidate.exercise.id,
                      name: candidate.exercise.name,
                      equipment: candidate.exercise.equipment,
                      primaryMuscle: candidate.exercise.primary_muscle_group,
                      secondaryMuscles: candidate.exercise.secondary_muscle_groups,
                    })),
                  )}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) return candidates;
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      body.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text)
        .filter((part): part is string => typeof part === "string")
        .join("\n")
        .trim() ?? "";
    const parsed = JSON.parse(text) as { exerciseIds?: unknown };
    if (!Array.isArray(parsed.exerciseIds)) return candidates;

    const byId = new Map(candidates.map((candidate) => [candidate.exercise.id, candidate]));
    const ordered = parsed.exerciseIds
      .map((id) => (typeof id === "string" ? byId.get(id) : undefined))
      .filter((candidate): candidate is ExerciseReplacementCandidate =>
        candidate !== undefined,
      );
    const remaining = candidates.filter(
      (candidate) => !ordered.some((item) => item.exercise.id === candidate.exercise.id),
    );
    return [...ordered, ...remaining];
  } finally {
    clearTimeout(timeout);
  }
}

function commonNameScore(name: string) {
  const value = name.toLowerCase();
  let score = 0;

  if (
    /press|row|pulldown|pull-up|squat|deadlift|curl|pushdown|raise|leg press|leg curl|hip thrust/.test(
      value,
    )
  ) {
    score += 16;
  }
  if (/barbell|dumbbell|cable|machine|seated|standing|incline|lateral/.test(value)) {
    score += 6;
  }
  if (
    /band|chain|plyo|jump|guillotine|behind|split|side|rollout|wrist|neck|one-arm|single-leg|bosu/.test(
      value,
    )
  ) {
    score -= 34;
  }
  if (value.length > 45) score -= 10;

  return score;
}

function isCommonEquipment(equipment: string | null) {
  const value = normalized(equipment);
  return [
    "barbell",
    "dumbbell",
    "cable",
    "machine",
    "body only",
    "bodyweight",
    "e-z curl bar",
  ].includes(value);
}

function normalized(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}
