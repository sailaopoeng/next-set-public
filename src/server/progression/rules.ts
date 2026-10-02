import type {
  Exercise,
  ProgressionDecision,
  SessionExercise,
  SessionSet,
  VolumeMultiplier,
} from "@/lib/domain";
import { textMentionsPain } from "@/lib/pain";
import { sessionSetVolume } from "@/lib/workout-metrics";

export type ProgressionInput = {
  sessionExercise: SessionExercise & { exercise: Exercise };
  sets: SessionSet[];
  sessionNotes?: string | null;
  previousPerformance?: ExercisePerformance[];
};

export type ExercisePerformance = {
  finishedAt: string;
  bestEstimatedOneRepMax: number;
  totalVolume: number;
  maxRpe: number | null;
};

export type ProgressionRecommendation = {
  sessionExerciseId: string;
  exerciseName: string;
  decision: ProgressionDecision;
  reason: string;
  suggestedTarget: {
    sets: number;
    repsMin: number;
    repsMax: number;
    weightKg: number | null;
    restSeconds: number;
    notes: string | null;
  };
};

export function recommendProgression({
  sessionExercise,
  sets,
  sessionNotes,
  previousPerformance = [],
}: ProgressionInput): ProgressionRecommendation {
  const completedSets = sets.filter((set) => set.completed);
  const maxRpe = maxNumber(completedSets.map((set) => set.rpe));
  const targetWeight = resolveWorkingWeight(
    sessionExercise.target_weight_kg,
    completedSets.slice(0, sessionExercise.planned_sets),
  );
  const painMentioned = textMentionsPain(sessionNotes) ||
    textMentionsPain(sessionExercise.notes) ||
    sets.some((set) => textMentionsPain(set.note));
  const completedEnoughSets = completedSets.length >= sessionExercise.planned_sets;
  const completedTargetReps =
    completedEnoughSets &&
    completedSets
      .slice(0, sessionExercise.planned_sets)
      .every((set) => set.reps >= sessionExercise.target_reps_min);
  const allTargetRepsAtTop =
    completedTargetReps &&
    completedSets
      .slice(0, sessionExercise.planned_sets)
      .every((set) => set.reps >= sessionExercise.target_reps_max);
  const highRpe = maxRpe !== null && maxRpe >= 9;
  const performanceDrop = hasTwoSessionPerformanceDrop(previousPerformance);
  const increment = sessionExercise.exercise.default_increment_kg;

  if (painMentioned) {
    return makeRecommendation(
      sessionExercise,
      "watch_pain",
      "Pain was mentioned, so load should not increase next time.",
      targetWeight,
      "Check pain before loading this movement again.",
    );
  }

  if (performanceDrop) {
    return makeRecommendation(
      sessionExercise,
      highRpe ? "reduce" : "stay",
      "Performance has dropped across recent sessions.",
      highRpe ? reduceWeight(targetWeight, increment) : targetWeight,
      "Keep the next exposure conservative.",
    );
  }

  if (!completedTargetReps) {
    return makeRecommendation(
      sessionExercise,
      "adjust_reps",
      "Target reps were not completed, so load should stay put.",
      targetWeight,
      "Repeat the load and aim to complete the low end of the rep range.",
    );
  }

  if (highRpe) {
    return makeRecommendation(
      sessionExercise,
      "stay",
      "RPE reached 9 or above, so increasing load is not recommended.",
      targetWeight,
      "Repeat this target before progressing.",
    );
  }

  if (allTargetRepsAtTop && (maxRpe === null || maxRpe <= 8)) {
    if (targetWeight === null || targetWeight <= 0) {
      return makeRecommendation(
        sessionExercise,
        "increase",
        "All target sets and reps were completed at RPE 8 or lower.",
        targetWeight,
        "Add reps or a small load next time if the movement allows.",
      );
    }

    return makeRecommendation(
      sessionExercise,
      "increase",
      "All target sets and reps were completed at RPE 8 or lower.",
      roundToHalf(targetWeight + increment),
      `Increase by ${increment}kg next time if equipment allows.`,
    );
  }

  return makeRecommendation(
    sessionExercise,
    "stay",
    "Work was completed, but not enough margin to progress load yet.",
    targetWeight,
    "Repeat the target and build reps before adding load.",
  );
}

export function epleyEstimatedOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0;
  }

  return roundToHalf(weightKg * (1 + reps / 30));
}

/**
 * Load the next target is based on. Never exceeds what was actually lifted:
 * - target missing or 0 (e.g. exercise added mid-session) -> lightest working set
 * - target never reached -> heaviest weight actually lifted
 * - every working set at or above target -> lightest working set
 * - mixed loads (pyramids, back-off sets) -> the planned target
 */
export function resolveWorkingWeight(
  plannedWeightKg: number | null,
  workingSets: Array<Pick<SessionSet, "weight_kg">>,
): number | null {
  const weights = workingSets
    .map((set) => set.weight_kg)
    .filter((weight): weight is number => typeof weight === "number" && weight > 0);
  const target = plannedWeightKg !== null && plannedWeightKg > 0 ? plannedWeightKg : null;

  if (weights.length === 0) return plannedWeightKg;

  const lightest = Math.min(...weights);
  const heaviest = Math.max(...weights);

  if (target === null) return lightest;
  if (heaviest < target) return heaviest;
  if (lightest >= target) return lightest;
  return target;
}

export function buildExercisePerformanceHistory(
  sessions: Array<{
    id: string;
    performed_at: string;
    session_exercises: Array<{
      exercise_id: string;
      exercise: { volume_multiplier: VolumeMultiplier };
      session_sets: SessionSet[];
    }>;
  }>,
  exerciseId: string,
  performedUntil?: string,
): ExercisePerformance[] {
  const seen = new Set<string>();
  const until = performedUntil ? Date.parse(performedUntil) : Number.POSITIVE_INFINITY;

  return sessions
    .filter((session) => {
      if (seen.has(session.id) || Date.parse(session.performed_at) > until) return false;
      seen.add(session.id);
      return true;
    })
    .toSorted((left, right) => Date.parse(right.performed_at) - Date.parse(left.performed_at))
    .flatMap((session) => {
      const completed = session.session_exercises
        .filter((exercise) => exercise.exercise_id === exerciseId)
        .flatMap((exercise) =>
          exercise.session_sets
            .filter((set) => set.completed && set.reps > 0)
            .map((set) => ({ set, multiplier: exercise.exercise.volume_multiplier })),
        );

      if (completed.length === 0) return [];

      return [{
        finishedAt: session.performed_at,
        bestEstimatedOneRepMax: Math.max(
          ...completed.map(({ set }) => epleyEstimatedOneRepMax(set.weight_kg, set.reps)),
        ),
        totalVolume: completed.reduce(
          (total, { set, multiplier }) => total + sessionSetVolume(set, multiplier),
          0,
        ),
        maxRpe: maxNumber(completed.map(({ set }) => set.rpe)),
      }];
    });
}

function makeRecommendation(
  sessionExercise: SessionExercise & { exercise: Exercise },
  decision: ProgressionDecision,
  reason: string,
  weightKg: number | null,
  notes: string | null,
): ProgressionRecommendation {
  return {
    sessionExerciseId: sessionExercise.id,
    exerciseName: sessionExercise.exercise.name,
    decision,
    reason,
    suggestedTarget: {
      sets: sessionExercise.planned_sets,
      repsMin: sessionExercise.target_reps_min,
      repsMax: sessionExercise.target_reps_max,
      weightKg,
      restSeconds: sessionExercise.rest_seconds,
      notes,
    },
  };
}

function reduceWeight(weight: number | null, increment: number): number | null {
  if (weight === null) return null;
  return Math.max(0, roundToHalf(weight - increment));
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function maxNumber(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function hasTwoSessionPerformanceDrop(history: ExercisePerformance[]) {
  if (history.length < 2) {
    return false;
  }

  const [latest, previous] = history;
  return (
    latest.bestEstimatedOneRepMax < previous.bestEstimatedOneRepMax &&
    latest.totalVolume < previous.totalVolume
  );
}
