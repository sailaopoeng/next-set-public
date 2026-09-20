import type {
  Exercise,
  ProgressionDecision,
  SessionExercise,
  SessionSet,
} from "@/lib/domain";
import { textMentionsPain } from "@/lib/pain";

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
  const topWeight = maxNumber(completedSets.map((set) => set.weight_kg));
  const targetWeight = sessionExercise.target_weight_kg ?? topWeight;
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
    return makeRecommendation(
      sessionExercise,
      "increase",
      "All target sets and reps were completed at RPE 8 or lower.",
      roundToHalf((targetWeight ?? 0) + increment),
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
