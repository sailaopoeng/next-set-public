import { describe, expect, it } from "vitest";

import type { Exercise, SessionExercise, SessionSet } from "@/lib/domain";
import {
  buildExercisePerformanceHistory,
  epleyEstimatedOneRepMax,
  recommendProgression,
  resolveWorkingWeight,
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

function set(
  reps: number,
  rpe: number,
  note: string | null = null,
  weightKg = 60,
): SessionSet {
  return {
    id: crypto.randomUUID(),
    session_exercise_id: sessionExercise.id,
    set_number: 1,
    weight_kg: weightKg,
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

  it("blocks an increase for pain in session or exercise notes", () => {
    const sets = [set(8, 7), set(8, 7), set(8, 7)];
    expect(recommendProgression({
      sessionExercise,
      sets,
      sessionNotes: "sharp shoulder pain",
    }).decision).toBe("watch_pain");
    expect(recommendProgression({
      sessionExercise: { ...sessionExercise, notes: "knee injury" },
      sets,
    }).decision).toBe("watch_pain");
  });

  it("does not mistake unrelated notes for pain", () => {
    expect(recommendProgression({
      sessionExercise: { ...sessionExercise, notes: "pinch collar" },
      sets: [set(8, 7), set(8, 7), set(8, 7)],
      sessionNotes: "sore from yesterday",
    }).decision).toBe("increase");
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

  it("progresses from the weight actually lifted when it was below target", () => {
    const result = recommendProgression({
      sessionExercise,
      sets: [set(8, 7, null, 50), set(8, 7, null, 50), set(8, 7, null, 50)],
    });

    expect(result.decision).toBe("increase");
    expect(result.suggestedTarget.weightKg).toBe(52.5);
  });

  it("does not hold a stay or missed-rep target above the weight lifted", () => {
    expect(recommendProgression({
      sessionExercise,
      sets: [set(8, 9, null, 50), set(8, 9, null, 50), set(8, 9, null, 50)],
    }).suggestedTarget.weightKg).toBe(50);
    expect(recommendProgression({
      sessionExercise,
      sets: [set(8, 8, null, 50), set(5, 8, null, 50), set(4, 8, null, 50)],
    }).suggestedTarget.weightKg).toBe(50);
  });

  it("progresses from the weight lifted when straight sets beat the target", () => {
    const result = recommendProgression({
      sessionExercise,
      sets: [set(8, 7, null, 70), set(8, 7, null, 70), set(8, 7, null, 70)],
    });

    expect(result.suggestedTarget.weightKg).toBe(72.5);
  });

  it("uses logged weights for exercises added mid-session with a 0kg target", () => {
    const added = { ...sessionExercise, target_weight_kg: 0 };

    const increase = recommendProgression({
      sessionExercise: added,
      sets: [set(8, 7), set(8, 7), set(8, 7)],
    });
    expect(increase.decision).toBe("increase");
    expect(increase.suggestedTarget.weightKg).toBe(62.5);

    const stay = recommendProgression({
      sessionExercise: added,
      sets: [set(8, 9), set(8, 9), set(8, 9)],
    });
    expect(stay.decision).toBe("stay");
    expect(stay.suggestedTarget.weightKg).toBe(60);
  });

  it("does not add load to an unloaded movement", () => {
    const result = recommendProgression({
      sessionExercise: { ...sessionExercise, target_weight_kg: 0 },
      sets: [set(8, 7, null, 0), set(8, 7, null, 0), set(8, 7, null, 0)],
    });

    expect(result.decision).toBe("increase");
    expect(result.suggestedTarget.weightKg).toBe(0);
  });

  it("resolves working weight conservatively", () => {
    const weights = (...values: number[]) => values.map((weight_kg) => ({ weight_kg }));

    expect(resolveWorkingWeight(null, weights(40, 45))).toBe(40);
    expect(resolveWorkingWeight(60, weights(50, 55))).toBe(55);
    expect(resolveWorkingWeight(60, weights(60, 65))).toBe(60);
    expect(resolveWorkingWeight(70, weights(60, 65, 70))).toBe(70);
    expect(resolveWorkingWeight(60, [])).toBe(60);
    expect(resolveWorkingWeight(0, weights(0, 0))).toBe(0);
  });

  it("holds load after a two-session performance drop", () => {
    const sessionFor = (id: string, performedAt: string, weightKg: number, reps: number) => ({
      id,
      performed_at: performedAt,
      session_exercises: [{
        exercise_id: exercise.id,
        exercise,
        session_sets: [set(reps, 7, null, weightKg), set(reps, 7, null, weightKg), set(reps, 7, null, weightKg)],
      }],
    });
    const history = buildExercisePerformanceHistory(
      [
        sessionFor("older", "2026-09-01T10:00:00Z", 60, 8),
        sessionFor("latest", "2026-09-04T10:00:00Z", 57.5, 8),
        sessionFor("future", "2026-09-08T10:00:00Z", 80, 8),
      ],
      exercise.id,
      "2026-09-04T10:00:00Z",
    );

    expect(history.map((entry) => entry.finishedAt)).toEqual([
      "2026-09-04T10:00:00Z",
      "2026-09-01T10:00:00Z",
    ]);

    const result = recommendProgression({
      sessionExercise: { ...sessionExercise, target_weight_kg: 57.5 },
      sets: [set(8, 7, null, 57.5), set(8, 7, null, 57.5), set(8, 7, null, 57.5)],
      previousPerformance: history,
    });

    expect(result.decision).toBe("stay");
    expect(result.suggestedTarget.weightKg).toBe(57.5);
  });
});
