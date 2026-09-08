import { describe, expect, it } from "vitest";

import {
  getIncompleteSessionSummary,
  isSessionExerciseComplete,
} from "@/components/session/session-completion";
import type { SessionWithDetails } from "@/lib/domain";

type SessionExerciseDetails =
  SessionWithDetails["session_exercises"][number];

function exercise(
  name: string,
  completedSets: boolean[],
): SessionExerciseDetails {
  return {
    id: `session-${name}`,
    session_id: "session-1",
    exercise_id: `exercise-${name}`,
    exercise_order: 1,
    planned_sets: completedSets.length,
    target_reps_min: 8,
    target_reps_max: 12,
    target_weight_kg: 20,
    rest_seconds: 90,
    notes: null,
    exercise: {
      id: `exercise-${name}`,
      name,
      primary_muscle_group: "Chest",
      secondary_muscle_groups: [],
      equipment: "Barbell",
      lift_category: "barbell_upper",
      default_increment_kg: 2.5,
      is_main_lift: true,
      volume_multiplier: 1,
      is_ai_suggestion_enabled: true,
      notes: null,
    },
    session_sets: completedSets.map((completed, index) => ({
      id: `set-${name}-${index}`,
      session_exercise_id: `session-${name}`,
      set_number: index + 1,
      weight_kg: 20,
      reps: 10,
      rpe: 7,
      completed,
      note: null,
    })),
  };
}

describe("session completion", () => {
  it("marks an exercise complete only when every existing set is checked", () => {
    expect(isSessionExerciseComplete(exercise("Bench", [true, true]))).toBe(
      true,
    );
    expect(isSessionExerciseComplete(exercise("Bench", [true, false]))).toBe(
      false,
    );
    expect(isSessionExerciseComplete(exercise("Bench", []))).toBe(false);
  });

  it("summarizes unchecked sets and affected exercises", () => {
    const summary = getIncompleteSessionSummary([
      exercise("Bench", [true, true]),
      exercise("Squat", [true, false, false]),
      exercise("Row", [false]),
    ]);

    expect(summary).toEqual({
      incompleteExerciseNames: ["Squat", "Row"],
      incompleteSetCount: 3,
    });
  });

  it("includes an exercise with no sets in the incomplete exercise list", () => {
    expect(getIncompleteSessionSummary([exercise("Bench", [])])).toEqual({
      incompleteExerciseNames: ["Bench"],
      incompleteSetCount: 0,
    });
  });
});
