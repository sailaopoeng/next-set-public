import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiReviewPayload } from "@/lib/validation/schemas";
import { aiReviewSchema } from "@/lib/validation/schemas";
import { canonicalMuscleGroup } from "@/lib/muscle-groups";
import {
  type Exercise,
  type SessionWithDetails,
  type TemplateExercise,
  type WorkoutTemplate,
} from "@/lib/domain";
import {
  type AnalyticsRange,
  buildWeeklyMuscleSetProgress,
  getSundayWeekRangeSingapore,
  WEEKLY_MUSCLE_TARGETS,
} from "@/server/analytics/calculations";
import { getSingaporeWeekday } from "@/lib/workout-schedule";
import {
  listAiSuggestionExercises,
  listAllCompletedSessionDetails,
  getProfilePreferences,
  listTemplates,
} from "@/server/db/queries";
import {
  recommendProgression,
  type ProgressionRecommendation,
} from "@/server/progression/rules";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const AI_SUGGESTION_NAMES = [
  "Aurora Ascent",
  "Emerald Horizon",
  "Golden Summit",
  "Moonlit Momentum",
  "Silver Dawn",
  "Velvet Horizon",
  "Quiet Ascent",
  "Radiant Summit",
] as const;
const REQUIRED_FULL_BODY_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "quads",
  "hamstrings",
] as const;
const SESSION_DURATION_RULES = {
  weekday: { minimum: 45, maximum: 50 },
  sunday: { minimum: 55, maximum: 70 },
} as const;
const SESSION_TIME_BUFFER_MINUTES = 5;

type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
};

type NextSessionSuggestion = NonNullable<AiReviewPayload["nextSessionSuggestion"]>;
type SuggestionTarget = NextSessionSuggestion["exercises"][number]["target"];
type PromptOptions = {
  validationFailures?: string[];
};

type PlanningContext = {
  planningWeekStart: string;
  planningWeekEnd: string;
  planningPhase: "first_exposure" | "close_minimums" | "optional_bonus";
  targetSessionType: "weekday" | "sunday";
  durationMinimumMinutes: number;
  durationMaximumMinutes: number;
  setupAndWarmupBufferMinutes: number;
  weeklySessions: SessionWithDetails[];
  weeklyTargets: Array<{
    muscleGroup: string;
    sets: number;
    minimum: number;
    maximum: number;
    remainingToMinimum: number;
    sessionsHit: number;
  }>;
  allowedExercises: Exercise[];
  activeTemplates: TemplateWithExercises[];
  history: SessionWithDetails[];
};

export async function reviewAndSaveSession(
  supabase: SupabaseClient,
  userId: string,
  session: SessionWithDetails,
) {
  const reviewedWeek = getSundayWeekRangeSingapore(
    new Date(session.performed_at),
  );
  const [templates, allCompletedSessions, allowedExercises, preferences] =
    await Promise.all([
      listTemplates(supabase, userId),
      listAllCompletedSessionDetails(supabase, userId),
      listAiSuggestionExercises(supabase, userId),
      getProfilePreferences(supabase, userId),
    ]);
  const recentSessions = allCompletedSessions.slice(0, 20);
  const reviewedWeekSessions = sessionsInRange(
    allCompletedSessions,
    reviewedWeek,
  );
  const planningWeek = getSuggestionPlanningRange(
    session,
    reviewedWeekSessions,
    preferences.weeklyMuscleTargets,
  );
  const weeklySessions = sessionsInRange(allCompletedSessions, planningWeek);
  const context = buildPlanningContext(
    session,
    templates,
    allCompletedSessions,
    weeklySessions,
    allowedExercises,
    planningWeek,
    preferences.weeklyMuscleTargets,
  );
  const fallback = buildFallbackReview(session, templates, recentSessions, context);
  const reviewFallback = withoutWorkoutSuggestion(fallback);
  const review = await getAiReview(session, reviewFallback, context).catch(
    () => reviewFallback,
  );
  const safeReview = applyHardRuleOverrides(review, reviewFallback, context);

  await saveReview(supabase, session, safeReview, context);

  return safeReview;
}

export function buildFallbackReview(
  session: SessionWithDetails,
  templates: TemplateWithExercises[] = [],
  recentSessions: SessionWithDetails[] = [],
  providedContext?: PlanningContext,
): AiReviewPayload {
  const decisions = session.session_exercises.map((exercise) =>
    recommendProgression({
      sessionExercise: exercise,
      sets: exercise.session_sets,
    }),
  );
  const context =
    providedContext ??
    buildPlanningContext(session, templates, recentSessions, recentSessions);
  const nextTemplate = selectNextTemplate(session, templates, context);
  const nextSessionSuggestion = nextTemplate
    ? buildTemplateSuggestion(session, nextTemplate, recentSessions, context)
    : buildSessionBasedSuggestion(session, decisions, context);

  return {
    schemaVersion: 1,
    sessionSummary: `${session.name} saved with ${decisions.length} exercises. Progression is conservative and based on completed reps, RPE, and pain notes.`,
    exerciseDecisions: decisions.map(toAiDecision),
    nextSessionSuggestion,
  };
}

export async function getAiReview(
  session: SessionWithDetails,
  fallback: AiReviewPayload,
  context: PlanningContext,
) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const initialReview = await requestGeminiReview(
    model,
    apiKey,
    buildPrompt(session, fallback, context),
  );
  const validationFailures = initialReview.nextSessionSuggestion
    ? getSuggestionValidationFailures(initialReview.nextSessionSuggestion, context)
    : [];

  if (validationFailures.length > 0) {
    return requestGeminiReview(
      model,
      apiKey,
      buildPrompt(session, fallback, context, {
        validationFailures,
      }),
    );
  }

  return initialReview;
}

async function requestGeminiReview(model: string, apiKey: string, promptText: string) {
  // console.log("[NextSet AI PROMPT]", promptText);
  const response = await fetch(
    `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini review failed: ${response.status}`);
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

  // console.log("[NextSet AI REPLY]", text);

  return aiReviewSchema.parse(JSON.parse(text));
}

export function buildPrompt(
  session: SessionWithDetails,
  fallback: AiReviewPayload,
  context: PlanningContext,
  options: PromptOptions = {},
) {
  const correctionInstruction = options.validationFailures?.length
    ? `
Correction required:
- Your previous nextSessionSuggestion failed validation: ${options.validationFailures.join("; ")}.
- Redesign nextSessionSuggestion to satisfy every full-body, time, weekly-target, exercise-eligibility, and non-template requirement.
- If no practical non-template alternative is possible, return nextSessionSuggestion as null.
`
    : "";

  return `You are NextSet, a conservative AI progression advisor for one lifter.

Return only valid JSON matching this exact shape:
{
  "schemaVersion": 1,
  "sessionSummary": "short text",
  "exerciseDecisions": [{
    "sessionExerciseId": "uuid",
    "exerciseName": "text",
    "decision": "increase|stay|reduce|adjust_reps|watch_pain",
    "reason": "brief reason",
    "suggestedTarget": {
      "sets": 3,
      "repsMin": 8,
      "repsMax": 10,
      "weightKg": 62.5,
      "restSeconds": 90,
      "notes": "brief note or null"
    }
  }],
  "nextSessionSuggestion": {
    "sourceTemplateId": "uuid or null",
    "name": "a distinct AI draft title such as Aurora Ascent",
    "rationale": "brief text",
    "weeklyBalanceNotes": ["brief text"],
    "estimatedDurationMinutes": 48,
    "exercises": [{
      "exerciseId": "uuid",
      "exerciseName": "text",
      "exerciseOrder": 1,
      "target": {
        "sets": 3,
        "repsMin": 8,
        "repsMax": 10,
        "weightKg": 62.5,
        "restSeconds": 90,
        "notes": "brief note or null"
      }
    }]
  } or null when there are no allowed exercise choices
}

Rules:
- Use conservative progression.
- Do not increase weight if target reps failed.
- Do not increase weight if RPE is 9 or above.
- Do not increase weight if pain is mentioned.
- If all target sets/reps are completed and RPE <= 8, suggest a small increase next time.
- Barbell upper body increase: 2.5kg.
- Dumbbell upper body increase: 1kg to 2.5kg per dumbbell.
- Lower-body compound increase: 2.5kg to 5kg.
- Explain briefly. No motivational paragraphs.
- Primary goal is hypertrophy. Keep full-body working sets practical for recovery and growth.
- Consider weekly working-set volume and recovery for hypertrophy; do not add random volume.
- The exerciseDecisions review applies to the just-finished session. Preserve conservative load safety in those decisions.
- Design nextSessionSuggestion yourself as a new next-workout draft using only exerciseId values from Allowed exercise choices.
- Return nextSessionSuggestion as null if Allowed exercise choices is empty or no safe, practical non-template draft is possible.
- Do not copy the just-completed workout when a distinct practical draft can address weekly targets.
- Do not reproduce the complete exercise selection of an existing saved workout template; the server rejects template-equivalent AI drafts.
- Return a complete full-body session, not a short ring-deficit top-up: include at least one exercise whose primary muscle is each of chest, back, shoulders, quads, and hamstrings.
- Weekly ring targets: ${context.weeklyTargets.map((target) => `${target.muscleGroup} ${target.minimum}-${target.maximum}`).join(", ")}. Biceps and triceps count direct sets only.
- Use completed workouts in the target planning week, not scheduled workout names: first exposure establishes a balanced base, second exposure aims to close minimums, and later sessions are optional deficit cleanup or recoverable bonus volume.
- Aim to reach each minimum and give each of the seven ring muscles a second session exposure by workout two when safe.
- If biceps or triceps still has remaining sets to its weekly minimum, include at least one direct primary exercise for that muscle group.
- Safety wins: if pain, missed reps, high RPE, or impractical session volume prevents closing a minimum now, state the remaining deficit in weeklyBalanceNotes.
- estimatedDurationMinutes must include working sets, planned rests, exercise transitions, and a ${context.setupAndWarmupBufferMinutes}-minute setup/personal warm-up buffer; do not prescribe warm-up exercises.
- This draft is for a ${context.targetSessionType} session and must estimate ${context.durationMinimumMinutes}-${context.durationMaximumMinutes} total minutes, inclusive.
- Set sourceTemplateId to null for every AI-designed draft.
${correctionInstruction}

Session JSON:
${JSON.stringify(session)}

Next-workout planning week and phase:
${JSON.stringify({
  weekStart: context.planningWeekStart,
  weekEnd: context.planningWeekEnd,
  phase: context.planningPhase,
  targetSessionType: context.targetSessionType,
  durationMinutes: {
    minimum: context.durationMinimumMinutes,
    maximum: context.durationMaximumMinutes,
    includedSetupAndWarmupBuffer: context.setupAndWarmupBufferMinutes,
  },
})}

Completed sessions already counted in that Sunday-start Singapore planning week:
${JSON.stringify(context.weeklySessions)}

Current weekly ring totals and deficits:
${JSON.stringify(context.weeklyTargets)}

Allowed exercise choices for nextSessionSuggestion:
${JSON.stringify(context.allowedExercises)}

Deterministic conservative exerciseDecisions and load-safety guidance for the completed session:
${JSON.stringify({
  sessionSummary: fallback.sessionSummary,
  exerciseDecisions: fallback.exerciseDecisions,
})}`;
}

export function applyHardRuleOverrides(
  review: AiReviewPayload,
  fallback: AiReviewPayload,
  context?: PlanningContext,
): AiReviewPayload {
  const fallbackByExercise = new Map(
    fallback.exerciseDecisions.map((decision) => [
      decision.sessionExerciseId,
      decision,
    ]),
  );

  const nextSessionSuggestion = context
    ? sanitizeAiSuggestion(review.nextSessionSuggestion, context)
    : review.nextSessionSuggestion;

  return {
    ...review,
    exerciseDecisions: review.exerciseDecisions.map((decision) => {
      const safe = fallbackByExercise.get(decision.sessionExerciseId);

      if (!safe) return decision;
      if (decision.decision === "increase" && safe.decision !== "increase") {
        return safe;
      }

      return decision;
    }),
    nextSessionSuggestion,
  };
}

async function saveReview(
  supabase: SupabaseClient,
  session: SessionWithDetails,
  review: AiReviewPayload,
  context: PlanningContext,
) {
  const suggestion = review.nextSessionSuggestion;
  const { error } = await supabase.rpc("save_session_review", {
    p_session_id: session.id,
    p_provider: process.env.GEMINI_API_KEY ? "gemini" : "fallback",
    p_model: process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
    p_summary: review.sessionSummary,
    p_raw_json: review,
    p_decisions: review.exerciseDecisions.map((decision) => ({
      session_exercise_id: decision.sessionExerciseId,
      exercise_name: decision.exerciseName,
      decision: decision.decision,
      reason: decision.reason,
      suggested_sets: decision.suggestedTarget.sets,
      suggested_reps_min: decision.suggestedTarget.repsMin,
      suggested_reps_max: decision.suggestedTarget.repsMax,
      suggested_weight_kg: decision.suggestedTarget.weightKg,
      suggested_rest_seconds: decision.suggestedTarget.restSeconds,
      notes: decision.suggestedTarget.notes,
    })),
    p_suggestion: suggestion
      ? {
          source_template_id: suggestion.sourceTemplateId,
          name: suggestion.name,
          rationale: suggestion.rationale,
          weekly_balance_notes: suggestion.weeklyBalanceNotes,
          estimated_duration_minutes: suggestion.estimatedDurationMinutes,
          target_session_type: context.targetSessionType,
          exercises: suggestion.exercises.map((exercise) => ({
            exercise_id: exercise.exerciseId,
            exercise_order: exercise.exerciseOrder,
            target_sets: exercise.target.sets,
            target_reps_min: exercise.target.repsMin,
            target_reps_max: exercise.target.repsMax,
            target_weight_kg: exercise.target.weightKg,
            rest_seconds: exercise.target.restSeconds,
            notes: exercise.target.notes,
          })),
        }
      : null,
  });

  if (error) throw error;
}

function toAiDecision(recommendation: ProgressionRecommendation) {
  return {
    sessionExerciseId: recommendation.sessionExerciseId,
    exerciseName: recommendation.exerciseName,
    decision: recommendation.decision,
    reason: recommendation.reason,
    suggestedTarget: recommendation.suggestedTarget,
  };
}

function buildTemplateSuggestion(
  session: SessionWithDetails,
  template: TemplateWithExercises,
  recentSessions: SessionWithDetails[],
  context: PlanningContext,
): NextSessionSuggestion {
  const projectedTargets = projectWeeklyTargets(template, context);
  const remaining = projectedTargets.filter(
    (target) => target.remainingToMinimum > 0,
  );
  const frequencyGaps = projectedTargets.filter((target) => target.sessionsHit < 2);
  const weeklyBalanceNotes = [
    "Fallback draft: use controlled hypertrophy working sets while aiming to close weekly ring minimums.",
  ];

  if (remaining.length === 0) {
    weeklyBalanceNotes.push(
      "This draft reaches the minimum target for all seven weekly muscle rings.",
    );
  } else {
    weeklyBalanceNotes.push(
      `Remaining minimum deficits after this draft: ${remaining
        .map((target) => `${target.muscleGroup} ${target.remainingToMinimum}`)
        .join(", ")} sets.`,
    );
  }
  if (frequencyGaps.length > 0) {
    weeklyBalanceNotes.push(
      `Still below two weekly exposures: ${frequencyGaps
        .map((target) => target.muscleGroup)
        .join(", ")}.`,
    );
  }

  return {
    sourceTemplateId: template.id,
    name: createAiSuggestionName(),
    rationale: `Use ${template.name} as the safest available fallback draft after ${session.name} while addressing weekly ring deficits.`,
    weeklyBalanceNotes,
    estimatedDurationMinutes: context.durationMinimumMinutes,
    exercises: template.workout_template_exercises.map((exercise) => ({
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise.name,
      exerciseOrder: exercise.exercise_order,
      target: buildTemplateTarget(session, exercise, recentSessions),
    })),
  };
}

function buildSessionBasedSuggestion(
  session: SessionWithDetails,
  decisions: ProgressionRecommendation[],
  context: PlanningContext,
): NextSessionSuggestion | null {
  const allowedExerciseIds = new Set(
    context.allowedExercises.map((exercise) => exercise.id),
  );
  if (
    session.session_exercises.length === 0 ||
    session.session_exercises.some(
      (exercise) => !allowedExerciseIds.has(exercise.exercise_id),
    )
  ) {
    return null;
  }
  const deficits = context.weeklyTargets.filter(
    (target) => target.remainingToMinimum > 0,
  );
  return {
    sourceTemplateId: session.template_id,
    name: createAiSuggestionName(),
    rationale:
      "No different active template is available, so this draft repeats the completed exercise list with conservative progression changes.",
    weeklyBalanceNotes: [
      deficits.length > 0
        ? `Fallback repeat leaves weekly minimums to address: ${deficits
            .map((target) => `${target.muscleGroup} ${target.remainingToMinimum}`)
            .join(", ")} sets.`
        : "All seven weekly muscle-ring minimums have already been reached.",
    ],
    estimatedDurationMinutes: context.durationMinimumMinutes,
    exercises: session.session_exercises.map((exercise, index) => ({
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise.name,
      exerciseOrder: exercise.exercise_order,
      target: decisions[index].suggestedTarget,
    })),
  };
}

function selectNextTemplate(
  session: SessionWithDetails,
  templates: TemplateWithExercises[],
  context: PlanningContext,
) {
  const active = templates
    .filter(
      (template) =>
        template.is_active &&
        template.workout_template_exercises.length > 0 &&
        template.workout_template_exercises.every((exercise) =>
          context.allowedExercises.some(
            (allowed) => allowed.id === exercise.exercise_id,
          ),
        ),
    )
    .toSorted((a, b) => a.sort_order - b.sort_order);

  if (active.length === 0) return null;

  const currentIndex = active.findIndex((template) =>
    matchesSessionTemplate(session, template),
  );
  const rotation =
    currentIndex >= 0
      ? [...active.slice(currentIndex + 1), ...active.slice(0, currentIndex)]
      : active;
  const alternativeTemplates = rotation.filter(
    (template) => !matchesSessionTemplate(session, template),
  );
  const candidates =
    alternativeTemplates.length > 0 ? alternativeTemplates : rotation;

  return candidates.reduce<TemplateWithExercises | null>((best, candidate) => {
    if (!best) return candidate;

    return scoreTemplateForWeek(candidate, context) >
      scoreTemplateForWeek(best, context)
      ? candidate
      : best;
  }, null);
}

function matchesSessionTemplate(
  session: SessionWithDetails,
  template: TemplateWithExercises,
) {
  return (
    session.template_id === template.id ||
    (session.template_id === null &&
      session.source_suggestion_id === null &&
      session.name.trim().toLowerCase() === template.name.trim().toLowerCase())
  );
}

function buildTemplateTarget(
  currentSession: SessionWithDetails,
  templateExercise: TemplateExercise & { exercise: Exercise },
  recentSessions: SessionWithDetails[],
): SuggestionTarget {
  const history = [
    currentSession,
    ...recentSessions.filter((session) => session.id !== currentSession.id),
  ];
  const previousExercise = history
    .flatMap((session) => session.session_exercises)
    .find((exercise) => exercise.exercise_id === templateExercise.exercise_id);
  const progression = previousExercise
    ? recommendProgression({
        sessionExercise: previousExercise,
        sets: previousExercise.session_sets,
      })
    : null;

  return {
    sets: templateExercise.target_sets,
    repsMin: templateExercise.target_reps_min,
    repsMax: templateExercise.target_reps_max,
    weightKg:
      progression?.suggestedTarget.weightKg ?? templateExercise.target_weight_kg,
    restSeconds: templateExercise.rest_seconds,
    notes: combineNotes(
      templateExercise.notes,
      progression?.suggestedTarget.notes ?? null,
    ),
  };
}

function combineNotes(...notes: Array<string | null>) {
  const uniqueNotes = [...new Set(notes.filter((note) => note !== null))];
  return uniqueNotes.length > 0 ? uniqueNotes.join(" ").slice(0, 1000) : null;
}

function createAiSuggestionName() {
  return AI_SUGGESTION_NAMES[
    Math.floor(Math.random() * AI_SUGGESTION_NAMES.length)
  ];
}

export function buildPlanningContext(
  session: SessionWithDetails,
  templates: TemplateWithExercises[],
  historySessions: SessionWithDetails[],
  weeklySessions: SessionWithDetails[],
  permittedExercises?: Exercise[],
  planningWeek = getSundayWeekRangeSingapore(new Date(session.performed_at)),
  muscleTargetSettings?: import("@/lib/weekly-targets").WeeklyMuscleTargetSettings,
): PlanningContext {
  const weeklyHistory = sessionsInRange([session, ...weeklySessions], planningWeek);
  const defaultExercises = uniqueExercises([
    ...session.session_exercises.map((entry) => entry.exercise),
    ...templates.flatMap((template) =>
      template.workout_template_exercises.map((entry) => entry.exercise),
    ),
    ...historySessions.flatMap((entry) =>
      entry.session_exercises.map((sessionExercise) => sessionExercise.exercise),
    ),
  ]).filter((exercise) => exercise.is_ai_suggestion_enabled);
  const allowedExercises = permittedExercises ?? defaultExercises;
  const allowedIds = new Set(allowedExercises.map((exercise) => exercise.id));
  const activeTemplates = templates.filter(
    (template) =>
      template.is_active &&
      template.workout_template_exercises.length > 0 &&
      template.workout_template_exercises.every((entry) =>
        allowedIds.has(entry.exercise_id),
      ),
  );
  const history = uniqueSessions([session, ...historySessions, ...weeklyHistory]);
  const progress = buildWeeklyMuscleSetProgress(weeklyHistory, muscleTargetSettings);
  const targetSessionType =
    weeklyHistory.some((weeklySession) => weeklySession.id === session.id)
      ? "weekday"
      : "sunday";
  const durationRule = SESSION_DURATION_RULES[targetSessionType];

  return {
    planningWeekStart: planningWeek.weekStart.toISOString(),
    planningWeekEnd: planningWeek.weekEnd.toISOString(),
    planningPhase:
      weeklyHistory.length === 0
        ? "first_exposure"
        : weeklyHistory.length === 1
          ? "close_minimums"
          : "optional_bonus",
    targetSessionType,
    durationMinimumMinutes: durationRule.minimum,
    durationMaximumMinutes: durationRule.maximum,
    setupAndWarmupBufferMinutes: SESSION_TIME_BUFFER_MINUTES,
    weeklySessions: weeklyHistory,
    weeklyTargets: progress.map((target) => {
      const rule = WEEKLY_MUSCLE_TARGETS.find(
        (candidate) => candidate.muscleGroup === target.muscleGroup,
      )!;

      return {
        muscleGroup: target.muscleGroup,
        sets: target.sets,
        minimum: target.minimum,
        maximum: target.maximum,
        remainingToMinimum: Math.max(0, target.minimum - target.sets),
        sessionsHit: weeklyHistory.filter((weeklySession) =>
          sessionHitsMuscle(weeklySession, rule),
        ).length,
      };
    }),
    allowedExercises,
    activeTemplates,
    history,
  };
}

export function getSuggestionPlanningRange(
  session: SessionWithDetails,
  reviewedWeekSessions: SessionWithDetails[],
  muscleTargetSettings?: import("@/lib/weekly-targets").WeeklyMuscleTargetSettings,
): AnalyticsRange {
  const reviewedWeek = getSundayWeekRangeSingapore(
    new Date(session.performed_at),
  );
  const completedThisWeek = sessionsInRange(
    [session, ...reviewedWeekSessions],
    reviewedWeek,
  );
  const weekday = getSingaporeWeekday(new Date(session.performed_at));
  const hasOpenMinimum = buildWeeklyMuscleSetProgress(
    completedThisWeek,
    muscleTargetSettings,
  ).some(
    (target) => target.sets < target.minimum,
  );
  const isThursdayCatchUp =
    weekday === "Thu" && completedThisWeek.length < 2 && hasOpenMinimum;
  const plansNextWeek =
    weekday === "Fri" || weekday === "Sat" || (weekday === "Thu" && !isThursdayCatchUp);

  if (!plansNextWeek) {
    return reviewedWeek;
  }

  const weekStart = new Date(reviewedWeek.weekEnd);
  const weekEnd = new Date(
    weekStart.getTime() + 7 * 24 * 60 * 60 * 1000,
  );
  return { weekStart, weekEnd };
}

function sanitizeAiSuggestion(
  suggestion: AiReviewPayload["nextSessionSuggestion"],
  context: PlanningContext,
) {
  if (!suggestion) return null;
  const allowedById = new Map(
    context.allowedExercises.map((exercise) => [exercise.id, exercise]),
  );

  if (getSuggestionValidationFailures(suggestion, context).length > 0) {
    return null;
  }

  const exercises = suggestion.exercises
    .toSorted((left, right) => left.exerciseOrder - right.exerciseOrder)
    .map((item, index) => {
      const storedExercise = allowedById.get(item.exerciseId)!;
      return {
        ...item,
        exerciseName: storedExercise.name,
        exerciseOrder: index + 1,
        target: applySafeSuggestionWeight(item.target, storedExercise, context),
      };
    });
  return {
    ...suggestion,
    sourceTemplateId: null,
    exercises,
  };
}

export function isTemplateEquivalentSuggestion(
  suggestion: NextSessionSuggestion,
  context: PlanningContext,
) {
  const suggestionIds = suggestion.exercises.map((exercise) => exercise.exerciseId);

  return context.activeTemplates.some((template) =>
    exerciseIdSetsMatch(
      suggestionIds,
      template.workout_template_exercises.map((exercise) => exercise.exercise_id),
    ),
  );
}

export function getSuggestionValidationFailures(
  suggestion: NextSessionSuggestion,
  context: PlanningContext,
) {
  const failures: string[] = [];
  const allowedById = new Map(
    context.allowedExercises.map((exercise) => [exercise.id, exercise]),
  );
  const ids = suggestion.exercises.map((exercise) => exercise.exerciseId);

  if (ids.length === 0) failures.push("the draft has no exercises");
  if (new Set(ids).size !== ids.length) failures.push("the draft repeats an exercise");
  if (ids.some((id) => !allowedById.has(id))) {
    failures.push("the draft uses an exercise not allowed for AI suggestions");
  }
  if (isTemplateEquivalentSuggestion(suggestion, context)) {
    failures.push("the draft duplicates a saved workout template");
  }
  if (
    suggestion.estimatedDurationMinutes < context.durationMinimumMinutes ||
    suggestion.estimatedDurationMinutes > context.durationMaximumMinutes
  ) {
    failures.push(
      `estimated duration must be ${context.durationMinimumMinutes}-${context.durationMaximumMinutes} minutes`,
    );
  }

  const primaryGroups = new Set(
    ids.flatMap((id) => {
      const exercise = allowedById.get(id);
      return exercise
        ? [canonicalMuscleGroup(exercise.primary_muscle_group)]
        : [];
    }),
  );
  const missingMajorGroups = REQUIRED_FULL_BODY_GROUPS.filter(
    (group) => !primaryGroups.has(group),
  );
  if (missingMajorGroups.length > 0) {
    failures.push(
      `missing primary full-body coverage for ${missingMajorGroups.join(", ")}`,
    );
  }

  for (const armGroup of ["biceps", "triceps"] as const) {
    const needsDirectWork = context.weeklyTargets.some(
      (target) =>
        target.muscleGroup === armGroup && target.remainingToMinimum > 0,
    );
    if (needsDirectWork && !primaryGroups.has(armGroup)) {
      failures.push(`missing direct primary ${armGroup} work for its open ring`);
    }
  }

  return failures;
}

function withoutWorkoutSuggestion(review: AiReviewPayload): AiReviewPayload {
  return {
    ...review,
    nextSessionSuggestion: null,
  };
}

function applySafeSuggestionWeight(
  target: SuggestionTarget,
  exercise: Exercise,
  context: PlanningContext,
) {
  const previousExercise = context.history
    .flatMap((historySession) => historySession.session_exercises)
    .find((sessionExercise) => sessionExercise.exercise_id === exercise.id);

  if (!previousExercise) return target;

  const safe = recommendProgression({
    sessionExercise: previousExercise,
    sets: previousExercise.session_sets,
  }).suggestedTarget;

  if (
    target.weightKg === null ||
    safe.weightKg === null ||
    target.weightKg <= safe.weightKg
  ) {
    return target;
  }

  return {
    ...target,
    weightKg: safe.weightKg,
    notes: combineNotes(target.notes, safe.notes),
  };
}

function scoreTemplateForWeek(
  template: TemplateWithExercises,
  context: PlanningContext,
) {
  return projectWeeklyTargets(template, context).reduce((score, projected) => {
    const current = context.weeklyTargets.find(
      (target) => target.muscleGroup === projected.muscleGroup,
    )!;
    const closedSets =
      current.remainingToMinimum - projected.remainingToMinimum;
    const secondExposure =
      current.sessionsHit < 2 && projected.sessionsHit >= 2 ? 1 : 0;

    return score + closedSets + secondExposure * 10;
  }, 0);
}

function projectWeeklyTargets(
  template: TemplateWithExercises,
  context: PlanningContext,
) {
  return context.weeklyTargets.map((target) => {
    const rule = WEEKLY_MUSCLE_TARGETS.find(
      (candidate) => candidate.muscleGroup === target.muscleGroup,
    )!;
    const addedSets = template.workout_template_exercises.reduce(
      (sets, item) =>
        sets +
        muscleSetContribution(item.exercise, item.target_sets, rule),
      0,
    );

    return {
      ...target,
      remainingToMinimum: Math.max(
        0,
        target.minimum - target.sets - addedSets,
      ),
      sessionsHit:
        target.sessionsHit + (addedSets > 0 ? 1 : 0),
    };
  });
}

function sessionHitsMuscle(
  session: SessionWithDetails,
  target: (typeof WEEKLY_MUSCLE_TARGETS)[number],
) {
  return session.session_exercises.some(
    (exercise) =>
      exercise.session_sets.some((set) => set.completed) &&
      muscleSetContribution(exercise.exercise, 1, target) > 0,
  );
}

function muscleSetContribution(
  exercise: Exercise,
  sets: number,
  target: (typeof WEEKLY_MUSCLE_TARGETS)[number],
) {
  if (canonicalMuscleGroup(exercise.primary_muscle_group) === target.muscleGroup) {
    return sets;
  }
  if (
    !target.directOnly &&
    exercise.secondary_muscle_groups
      .map(canonicalMuscleGroup)
      .includes(target.muscleGroup)
  ) {
    return sets * 0.5;
  }
  return 0;
}

function sessionsInRange(
  sessions: SessionWithDetails[],
  range: AnalyticsRange,
) {
  return uniqueSessions(sessions).filter((candidate) => {
    const performedAt = new Date(candidate.performed_at);
    return performedAt >= range.weekStart && performedAt < range.weekEnd;
  });
}

function uniqueSessions(sessions: SessionWithDetails[]) {
  return [...new Map(sessions.map((session) => [session.id, session])).values()];
}

function uniqueExercises(exercises: Exercise[]) {
  return [...new Map(exercises.map((exercise) => [exercise.id, exercise])).values()];
}

function exerciseIdSetsMatch(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((exerciseId) => right.includes(exerciseId))
  );
}
