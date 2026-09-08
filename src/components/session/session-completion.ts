import type { SessionWithDetails } from "@/lib/domain";

type SessionExerciseDetails =
  SessionWithDetails["session_exercises"][number];

export type IncompleteSessionSummary = {
  incompleteExerciseNames: string[];
  incompleteSetCount: number;
};

export function isSessionExerciseComplete(
  exercise: SessionExerciseDetails,
) {
  return (
    exercise.session_sets.length > 0 &&
    exercise.session_sets.every((set) => set.completed)
  );
}

export function getIncompleteSessionSummary(
  exercises: SessionExerciseDetails[],
): IncompleteSessionSummary {
  const incompleteExerciseNames: string[] = [];
  let incompleteSetCount = 0;

  for (const exercise of exercises) {
    const exerciseIncompleteSetCount = exercise.session_sets.filter(
      (set) => !set.completed,
    ).length;

    if (!isSessionExerciseComplete(exercise)) {
      incompleteExerciseNames.push(exercise.exercise.name);
      incompleteSetCount += exerciseIncompleteSetCount;
    }
  }

  return { incompleteExerciseNames, incompleteSetCount };
}
