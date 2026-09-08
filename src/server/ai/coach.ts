import type { SupabaseClient } from "@supabase/supabase-js";

import type { Exercise, SessionWithDetails } from "@/lib/domain";
import { canonicalMuscleGroup } from "@/lib/muscle-groups";
import {
  coachWorkoutSchema,
  type CoachRequestPayload,
  type CoachWorkoutPayload,
} from "@/lib/validation/schemas";
import { listCompletedSessionDetails, listExercises, listTemplates } from "@/server/db/queries";
import { recommendProgression } from "@/server/progression/rules";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_COACH_MODEL = "gemini-3.5-flash";
const MAX_CATALOG_EXERCISES = 200;

export type CoachExerciseMatch = {
  status: "matched" | "needs_confirmation" | "unmatched";
  exercise: Exercise | null;
  candidates: Exercise[];
  reason: string;
};

export type CoachWorkoutWithMatches = CoachWorkoutPayload & {
  exercises: Array<
    CoachWorkoutPayload["exercises"][number] & {
      match: CoachExerciseMatch;
      safetyNotes: string[];
    }
  >;
};

type CoachCatalogExercise = Pick<
  Exercise,
  | "id"
  | "name"
  | "primary_muscle_group"
  | "secondary_muscle_groups"
  | "equipment"
  | "lift_category"
>;

export async function generateCoachWorkout(
  supabase: SupabaseClient,
  userId: string,
  request: CoachRequestPayload,
): Promise<CoachWorkoutWithMatches> {
  const [history, exercises, templates] = await Promise.all([
    listCompletedSessionDetails(supabase, userId, 20),
    listExercises(supabase, userId),
    listTemplates(supabase, userId),
  ]);
  const instruction = formatCoachInstruction(request);
  const catalog = buildCoachCatalog(exercises, templates, history);
  const fallback = buildFallbackCoachWorkout(instruction, history, catalog, request);
  const workout = await getAiCoachWorkout(
    instruction,
    request.retryToken,
    history.slice(0, 2),
    catalog,
    fallback,
  ).catch(() => fallback);

  return annotateCoachWorkout(workout, exercises, history, instruction);
}

export function formatCoachInstruction(request: CoachRequestPayload) {
  return [
    `Energy: ${request.energy}.`,
    `Muscle soreness: ${request.muscleSoreness}.`,
    `Available time: ${request.availableMinutes} minutes.`,
    request.instruction ? `Additional request: ${request.instruction}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function formatCompactHistory(sessions: SessionWithDetails[]) {
  if (sessions.length === 0) return "No completed workout history yet.";

  return sessions
    .slice(0, 2)
    .map((session) => {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(session.performed_at));
      const exerciseLines = session.session_exercises.map((exercise) => {
        const completedSets = exercise.session_sets
          .filter((set) => set.completed)
          .map(
            (set) =>
              `${formatNumber(set.weight_kg)}kg x ${set.reps}${set.rpe ? ` RPE${formatNumber(set.rpe)}` : ""}${set.note ? ` (${set.note})` : ""}`,
          );
        const target =
          `target ${exercise.planned_sets}x${exercise.target_reps_min}-${exercise.target_reps_max}` +
          (exercise.target_weight_kg !== null
            ? ` @ ${formatNumber(exercise.target_weight_kg)}kg`
            : "");

        return `- ${exercise.exercise.name}: ${target}; completed ${completedSets.join(", ") || "none"}${exercise.notes ? `; notes ${exercise.notes}` : ""}`;
      });

      return [`${date} ${session.name}${session.notes ? ` (${session.notes})` : ""}`, ...exerciseLines].join("\n");
    })
    .join("\n\n");
}

export function matchCoachExercise(
  exerciseName: string,
  exercises: Exercise[],
): CoachExerciseMatch {
  const wanted = normalizeName(exerciseName);
  const exact = exercises.find((exercise) => normalizeName(exercise.name) === wanted);
  if (exact) {
    return {
      status: "matched",
      exercise: exact,
      candidates: [exact],
      reason: "Exact name match.",
    };
  }

  const ranked = exercises
    .map((exercise) => ({
      exercise,
      score: scoreExerciseNameMatch(wanted, normalizeName(exercise.name)),
    }))
    .filter((item) => item.score >= 0.45)
    .toSorted((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.exercise.name.localeCompare(right.exercise.name);
    })
    .slice(0, 5);

  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return {
      status: "unmatched",
      exercise: null,
      candidates: [],
      reason: "No close exercise name found.",
    };
  }

  if (best.score >= 0.82 && (!second || best.score - second.score >= 0.12)) {
    return {
      status: "matched",
      exercise: best.exercise,
      candidates: ranked.map((item) => item.exercise),
      reason: "High-confidence name match.",
    };
  }

  return {
    status: "needs_confirmation",
    exercise: null,
    candidates: ranked.map((item) => item.exercise),
    reason: "Confirm the closest exercise match.",
  };
}

export function annotateCoachWorkout(
  workout: CoachWorkoutPayload,
  exercises: Exercise[],
  history: SessionWithDetails[],
  instruction: string,
): CoachWorkoutWithMatches {
  return {
    ...workout,
    exercises: workout.exercises.map((entry) => {
      const match = matchCoachExercise(entry.exerciseName, exercises);
      const safety =
        match.exercise !== null
          ? applyConservativeCoachSafety(entry, match.exercise, history, instruction)
          : { exercise: entry, notes: [] };

      return {
        ...safety.exercise,
        match,
        safetyNotes: safety.notes,
      };
    }),
  };
}

export function applyConservativeCoachSafety(
  entry: CoachWorkoutPayload["exercises"][number],
  exercise: Exercise,
  history: SessionWithDetails[],
  instruction: string,
): { exercise: CoachWorkoutPayload["exercises"][number]; notes: string[] } {
  const previous = findPreviousExercise(history, exercise.id);
  if (!previous) return { exercise: entry, notes: [] };

  const notes: string[] = [];
  const safeTarget = recommendProgression({
    sessionExercise: previous,
    sets: previous.session_sets,
  }).suggestedTarget;
  const blockedByInstruction = instructionBlocksExercise(instruction, exercise);
  const previousWeight =
    previous.target_weight_kg ??
    maxNumber(previous.session_sets.filter((set) => set.completed).map((set) => set.weight_kg));
  const cap =
    blockedByInstruction && previousWeight !== null
      ? Math.min(safeTarget.weightKg ?? previousWeight, previousWeight)
      : safeTarget.weightKg;

  if (cap === null) return { exercise: entry, notes: [] };

  const sets = entry.sets.map((set) => {
    if (set.weightKg === null || set.weightKg <= cap) return set;
    notes.push(
      `${entry.exerciseName} set ${set.setNumber} capped from ${formatNumber(set.weightKg)}kg to ${formatNumber(cap)}kg.`,
    );
    return { ...set, weightKg: cap };
  });

  if (blockedByInstruction) {
    notes.push(
      `${entry.exerciseName} kept conservative because your coach note mentioned fatigue, soreness, pain, or this muscle group.`,
    );
  }

  return {
    exercise: {
      ...entry,
      sets,
      notes: combineNotes(entry.notes ?? null, notes.length > 0 ? "Conservative safety cap applied." : null),
    },
    notes: [...new Set(notes)],
  };
}

async function getAiCoachWorkout(
  instruction: string,
  retryToken: string | undefined,
  history: SessionWithDetails[],
  catalog: CoachCatalogExercise[],
  fallback: CoachWorkoutPayload,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const model = process.env.GEMINI_COACH_MODEL ?? DEFAULT_COACH_MODEL;
  const prompt = buildCoachPrompt(instruction, retryToken, history, catalog);
  const first = await requestCoachWorkout(model, apiKey, prompt);
  const parsed = coachWorkoutSchema.safeParse(first);
  if (parsed.success) return parsed.data;

  const correction = await requestCoachWorkout(
    model,
    apiKey,
    `${prompt}

Correction required:
- The previous response did not match the required JSON schema.
- Return the same JSON shape only, with valid numbers, at least one exercise, and 1-12 sets per exercise.
- Validation error: ${parsed.error.message}`,
  );
  return coachWorkoutSchema.parse(correction);
}

async function requestCoachWorkout(model: string, apiKey: string, promptText: string) {
  const response = await fetch(
    `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini coach failed: ${response.status}`);
  }

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

  return JSON.parse(text) as unknown;
}

function buildCoachPrompt(
  instruction: string,
  retryToken: string | undefined,
  history: SessionWithDetails[],
  catalog: CoachCatalogExercise[],
) {
  return `You are a conservative personal gym coach for NextSet.

Return only valid JSON matching this exact shape:
{
  "schemaVersion": 1,
  "name": "short workout name",
  "rationale": "brief reason or null",
  "exercises": [{
    "exerciseName": "prefer an exact name from Exercise catalog",
    "primaryMuscleGroup": "brief muscle group or null",
    "equipment": "brief equipment or null",
    "notes": "brief note or null",
    "sets": [{
      "setNumber": 1,
      "reps": 8,
      "weightKg": 60,
      "restSeconds": 90,
      "notes": "brief note or null"
    }]
  }]
}

Rules:
- User instruction is the priority, but stay conservative.
- If the user says tired, sore, pain, or missed reps, reduce or hold load for affected muscles.
- Never increase load when recent history shows pain, missed reps, or RPE 9+.
- Use kilograms.
- Warm-up planning is out of scope; return working sets only.
- Prefer exact exerciseName values from Exercise catalog. If a better exercise is missing from the catalog, you may use a clear outside exercise name.
- Keep the result practical for a mobile gym logger: 4-8 exercises, 1-5 working sets per exercise.
- Fit the complete workout within the user's available time, reducing exercise and set count when needed.
- Low energy must not increase loads. Moderate or severe muscle soreness must not increase loads; severe soreness should also reduce workload.
- Default rest is 90 seconds unless the movement clearly needs another rest.
- Retry token, if present, means provide a meaningfully different suggestion while following the same instruction: ${retryToken ?? "none"}.

User instruction:
${instruction}

Last two completed workouts, compact text:
${formatCompactHistory(history)}

Exercise catalog:
${JSON.stringify(catalog)}`;
}

function buildCoachCatalog(
  exercises: Exercise[],
  templates: Awaited<ReturnType<typeof listTemplates>>,
  history: SessionWithDetails[],
): CoachCatalogExercise[] {
  const templateIds = templates.flatMap((template) =>
    template.workout_template_exercises.map((entry) => entry.exercise_id),
  );
  const recentIds = history
    .flatMap((session) => session.session_exercises.map((entry) => entry.exercise_id))
    .slice(0, 80);
  const preferredIds = new Set([
    ...templateIds,
    ...recentIds,
    ...exercises.filter((exercise) => exercise.is_ai_suggestion_enabled).map((exercise) => exercise.id),
  ]);
  const preferred = exercises.filter((exercise) => preferredIds.has(exercise.id));
  const remaining = exercises.filter((exercise) => !preferredIds.has(exercise.id));

  return [...preferred, ...remaining]
    .slice(0, MAX_CATALOG_EXERCISES)
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      primary_muscle_group: exercise.primary_muscle_group,
      secondary_muscle_groups: exercise.secondary_muscle_groups,
      equipment: exercise.equipment,
      lift_category: exercise.lift_category,
    }));
}

function buildFallbackCoachWorkout(
  instruction: string,
  history: SessionWithDetails[],
  catalog: CoachCatalogExercise[],
  request: CoachRequestPayload,
): CoachWorkoutPayload {
  const maxExercises = Math.min(8, Math.max(2, Math.floor(request.availableMinutes / 10) + 1));
  const maxSets = request.muscleSoreness === "severe" ? 2 : 4;
  const latest = history[0];
  const sourceExercises =
    latest?.session_exercises.slice(0, maxExercises).map((entry) => ({
      exerciseName: entry.exercise.name,
      primaryMuscleGroup: entry.exercise.primary_muscle_group,
      equipment: entry.exercise.equipment,
      notes: "Fallback based on recent workout history.",
      sets: Array.from({ length: Math.max(1, Math.min(maxSets, entry.planned_sets)) }, (_, index) => ({
        setNumber: index + 1,
        reps: entry.target_reps_min,
        weightKg: entry.target_weight_kg ?? 0,
        restSeconds: entry.rest_seconds,
        notes: null,
      })),
    })) ??
    catalog.slice(0, maxExercises).map((exercise, index) => ({
      exerciseName: exercise.name,
      primaryMuscleGroup: exercise.primary_muscle_group,
      equipment: exercise.equipment,
      notes: "Fallback from exercise catalog.",
      sets: [
        {
          setNumber: 1,
          reps: 8 + (index % 3) * 2,
          weightKg: exercise.lift_category === "bodyweight" ? 0 : null,
          restSeconds: 90,
          notes: null,
        },
      ],
    }));

  return {
    schemaVersion: 1,
    name: "Coach draft",
    rationale: `Fallback draft for: ${instruction.slice(0, 140)}`,
    exercises: sourceExercises.length > 0 ? sourceExercises : [
      {
        exerciseName: "Custom exercise",
        primaryMuscleGroup: null,
        equipment: null,
        notes: "Add or map this exercise before starting.",
        sets: [{ setNumber: 1, reps: 8, weightKg: null, restSeconds: 90, notes: null }],
      },
    ],
  };
}

function findPreviousExercise(history: SessionWithDetails[], exerciseId: string) {
  return history
    .flatMap((session) => session.session_exercises)
    .find((sessionExercise) => sessionExercise.exercise_id === exerciseId);
}

function instructionBlocksExercise(instruction: string, exercise: Exercise) {
  const normalized = instruction.toLowerCase();
  if (
    normalized.includes("energy: low") ||
    normalized.includes("muscle soreness: moderate") ||
    normalized.includes("muscle soreness: severe")
  ) {
    return true;
  }
  if (/\b(tired|fatigue|fatigued|exhausted|drained|pain|hurt|ache|sore)\b/.test(normalized)) {
    if (/\b(tired|fatigue|fatigued|exhausted|drained)\b/.test(normalized)) {
      return true;
    }
    const groups = [
      exercise.primary_muscle_group,
      ...exercise.secondary_muscle_groups,
    ].map(canonicalMuscleGroup);
    return groups.some((group) => normalized.includes(group));
  }

  return false;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bbb\b/g, "barbell")
    .replace(/\boh\b/g, "overhead")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreExerciseNameMatch(wanted: string, candidate: string) {
  if (!wanted || !candidate) return 0;
  if (candidate.includes(wanted) || wanted.includes(candidate)) return 0.86;

  const wantedTokens = new Set(wanted.split(" ").filter(Boolean));
  const candidateTokens = new Set(candidate.split(" ").filter(Boolean));
  const intersection = [...wantedTokens].filter((token) => candidateTokens.has(token));
  const union = new Set([...wantedTokens, ...candidateTokens]);
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;
  const coverage = wantedTokens.size > 0 ? intersection.length / wantedTokens.size : 0;

  return jaccard * 0.55 + coverage * 0.45;
}

function combineNotes(...notes: Array<string | null>) {
  const unique = [...new Set(notes.filter((note): note is string => Boolean(note)))];
  return unique.length > 0 ? unique.join(" ").slice(0, 1000) : null;
}

function maxNumber(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(value);
}
