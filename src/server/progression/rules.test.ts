import { describe, expect, it } from "vitest";

import type { Exercise, SessionExercise, SessionSet } from "@/lib/domain";
import {
  epleyEstimatedOneRepMax,
  recommendProgression,
} from "@/server/progression/rules";
import { sessionSetVolume } from "@/lib/workout-metrics";

const exercise: Exercise = {
  id: "exercise-1",
  name: "Bench Press",
  primary_muscle_group: "chest",
  secondary_muscle_groups: ["triceps"],
  equipment: "barbell",
  lift_category: "barbell_upper",
  default_increment_kg: 2.5,
  is_main_lift: true,
  is_ai_suggestion_enabled: true,
  volume_multiplier: 1,
  notes: null,
};

const sessionExercise: SessionExercise & { exercise: Exercise } = {
  id: "11111111-1111-4111-8111-111111111111",
  session_id: "session-1",
  exercise_id: "exercise-1",
  exercise_order: 1,
  planned_sets: 3,
  target_reps_min: 6,
  target_reps_max: 8,
  target_weight_kg: 60,
  rest_seconds: 150,
  notes: null,
  exercise,
};

function set(reps: number, rpe: number, note: string | null = null): SessionSet {
  return {
    id: crypto.randomUUID(),
    session_exercise_id: sessionExercise.id,
    set_number: 1,
    weight_kg: 60,
    reps,
    rpe,
    completed: true,
    note,
  };
}

describe("progression rules", () => {
  it("increases only when all top target reps are completed at RPE 8 or lower", () => {
    const result = recommendProgression({
      sessionExercise,
      sets: [set(8, 7), set(8, 8), set(8, 8)],
    });

    expect(result.decision).toBe("increase");
    expect(result.suggestedTarget.weightKg).toBe(62.5);
  });

  it("does not increase when RPE is 9 or higher", () => {
    const result = recommendProgression({
      sessionExercise,
      sets: [set(8, 9), set(8, 8), set(8, 8)],
    });

    expect(result.decision).toBe("stay");
    expect(result.suggestedTarget.weightKg).toBe(60);
  });

  it("watches pain notes before load progression", () => {
    const result = recommendProgression({
      sessionExercise,
      sets: [set(8, 7, "sharp shoulder pain"), set(8, 7), set(8, 7)],
    });

    expect(result.decision).toBe("watch_pain");
  });

  it("adjusts reps when targets were missed", () => {
    const result = recommendProgression({
      sessionExercise,
      sets: [set(8, 8), set(5, 8), set(4, 8)],
    });

    expect(result.decision).toBe("adjust_reps");
  });

  it("uses Epley estimated 1RM", () => {
    expect(epleyEstimatedOneRepMax(100, 6)).toBe(120);
  });

  it("applies an exercise multiplier only to volume", () => {
    expect(sessionSetVolume({ weight_kg: 15, reps: 10 }, 1)).toBe(150);
    expect(sessionSetVolume({ weight_kg: 15, reps: 10 }, 2)).toBe(300);
    expect(epleyEstimatedOneRepMax(15, 10)).toBe(20);
  });
});
