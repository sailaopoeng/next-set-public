import type { SessionSet } from "@/lib/domain";

export type PreviousSetSnapshot = {
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
};

export type PreviousExercisePerformance = {
  exerciseId: string;
  sessionId: string;
  performedAt: string;
  sets: PreviousSetSnapshot[];
};

export type PreviousSetSourceSession = {
  id: string;
  performed_at: string;
  session_exercises: Array<{
    exercise_id: string;
    session_sets: Array<{
      set_number: number;
      weight_kg: number;
      reps: number;
      rpe: number | null;
      completed: boolean;
    }>;
  }>;
};

export function pickLatestPreviousPerformance(
  sessions: PreviousSetSourceSession[],
  exerciseIds: string[],
): Record<string, PreviousExercisePerformance> {
  const wanted = new Set(exerciseIds);
  const result: Record<string, PreviousExercisePerformance> = {};
  const sorted = [...sessions].sort(
    (left, right) =>
      new Date(right.performed_at).getTime() -
      new Date(left.performed_at).getTime(),
  );

  for (const session of sorted) {
    for (const exercise of session.session_exercises) {
      if (!wanted.has(exercise.exercise_id) || result[exercise.exercise_id]) {
        continue;
      }

      const sets = exercise.session_sets
        .filter((set) => set.completed)
        .sort((left, right) => left.set_number - right.set_number)
        .map((set) => ({
          setNumber: set.set_number,
          weightKg: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe,
        }));

      if (sets.length === 0) continue;

      result[exercise.exercise_id] = {
        exerciseId: exercise.exercise_id,
        sessionId: session.id,
        performedAt: session.performed_at,
        sets,
      };
    }

    if (Object.keys(result).length === wanted.size) break;
  }

  return result;
}

export function previousSetForNumber(
  previous: PreviousExercisePerformance | undefined,
  setNumber: number,
) {
  return previous?.sets.find((set) => set.setNumber === setNumber) ?? null;
}

export function formatPreviousSetLabel(set: PreviousSetSnapshot) {
  const weight = new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: 1,
  }).format(set.weightKg);
  const rpe = set.rpe == null ? "" : ` @${set.rpe}`;
  return `${weight}×${set.reps}${rpe}`;
}

export function formatPreviousPerformanceSummary(
  previous: PreviousExercisePerformance,
) {
  return previous.sets.map(formatPreviousSetLabel).join(" · ");
}

export function copyPreviousSetValues(
  current: SessionSet,
  previous: PreviousSetSnapshot,
): SessionSet {
  if (current.completed) return current;

  return {
    ...current,
    weight_kg: previous.weightKg,
    reps: previous.reps,
  };
}

export function applyPreviousPerformance(
  currentSets: SessionSet[],
  previousSets: PreviousSetSnapshot[],
  sessionExerciseId: string,
  createId: () => string = () => crypto.randomUUID(),
): SessionSet[] {
  const previousByNumber = new Map(
    previousSets.map((set) => [set.setNumber, set]),
  );
  const next = currentSets.map((set) => {
    const previous = previousByNumber.get(set.set_number);
    return previous ? copyPreviousSetValues(set, previous) : set;
  });

  const extra = previousSets
    .filter((set) => set.setNumber > next.length)
    .sort((left, right) => left.setNumber - right.setNumber);

  for (const previous of extra) {
    if (next.length >= 12) break;
    next.push({
      id: createId(),
      session_exercise_id: sessionExerciseId,
      set_number: next.length + 1,
      weight_kg: previous.weightKg,
      reps: previous.reps,
      rpe: null,
      completed: false,
      note: null,
    });
  }

  return next.map((set, index) => ({ ...set, set_number: index + 1 }));
}
