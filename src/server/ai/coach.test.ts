import { afterEach, describe, expect, it, vi } from "vitest";

import type { Exercise, SessionWithDetails } from "@/lib/domain";
import {
  annotateCoachWorkout,
  applyConservativeCoachSafety,
  formatCompactHistory,
  formatCoachInstruction,
  generateCoachWorkout,
  matchCoachExercise,
} from "@/server/ai/coach";

const bench: Exercise = {
  id: "11111111-1111-4111-8111-111111111111",
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

const squat: Exercise = {
  ...bench,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Back Squat",
  primary_muscle_group: "quads",
  secondary_muscle_groups: ["glutes"],
  lift_category: "lower_compound",
  default_increment_kg: 5,
};

const session: SessionWithDetails = {
  id: "33333333-3333-4333-8333-333333333333",
  template_id: null,
  source_suggestion_id: null,
  name: "Workout A",
  status: "completed",
  performed_at: "2026-06-10T18:00:00+08:00",
  started_at: "2026-06-10T18:00:00+08:00",
  finished_at: "2026-06-10T19:00:00+08:00",
  notes: "felt okay",
  session_exercises: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      session_id: "33333333-3333-4333-8333-333333333333",
      exercise_id: bench.id,
      exercise_order: 1,
      planned_sets: 2,
      target_reps_min: 8,
      target_reps_max: 10,
      target_weight_kg: 50,
      rest_seconds: 90,
      notes: null,
      exercise: bench,
      session_sets: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          session_exercise_id: "44444444-4444-4444-8444-444444444444",
          set_number: 1,
          weight_kg: 50,
          reps: 10,
          rpe: 8,
          completed: true,
          note: null,
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          session_exercise_id: "44444444-4444-4444-8444-444444444444",
          set_number: 2,
          weight_kg: 50,
          reps: 9,
          rpe: 9,
          completed: true,
          note: "hard set",
        },
      ],
    },
  ],
};

describe("AI coach", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formats the last two workouts as compact plain text", () => {
    const text = formatCompactHistory([session, { ...session, id: squat.id, name: "Workout B" }]);

    expect(text).toContain("2026-06-10 Workout A");
    expect(text).toContain("Bench Press: target 2x8-10 @ 50kg");
    expect(text).toContain("50kg x 9 RPE9 (hard set)");
    expect(text).toContain("Workout B");
  });

  it("formats structured coach inputs with an optional note", () => {
    expect(
      formatCoachInstruction({
        energy: "normal",
        muscleSoreness: "none",
        availableMinutes: 45,
        instruction: "More shoulders",
      }),
    ).toBe(
      "Energy: normal.\nMuscle soreness: none.\nAvailable time: 45 minutes.\nAdditional request: More shoulders",
    );
  });

  it("matches exact names and leaves ambiguous names for confirmation", () => {
    expect(matchCoachExercise("Bench Press", [bench, squat]).status).toBe("matched");
    expect(
      matchCoachExercise("Press", [
        bench,
        { ...bench, id: squat.id, name: "Shoulder Press" },
      ]).status,
    ).toBe("needs_confirmation");
    expect(matchCoachExercise("Nordic Curl", [bench, squat]).status).toBe("unmatched");
  });

  it("caps unsafe coach load increases from recent high RPE history", () => {
    const result = applyConservativeCoachSafety(
      {
        exerciseName: "Bench Press",
        primaryMuscleGroup: "chest",
        equipment: "barbell",
        notes: null,
        sets: [
          { setNumber: 1, reps: 8, weightKg: 60, restSeconds: 90, notes: null },
        ],
      },
      bench,
      [session],
      "need more shoulder",
    );

    expect(result.exercise.sets[0].weightKg).toBe(50);
    expect(result.notes[0]).toContain("capped");
  });

  it("blocks increases when the user reports soreness for that muscle", () => {
    const squatSession = {
      ...session,
      session_exercises: [
        {
          ...session.session_exercises[0],
          exercise_id: squat.id,
          exercise: squat,
          target_weight_kg: 80,
          session_sets: session.session_exercises[0].session_sets.map((set) => ({
            ...set,
            weight_kg: 80,
            reps: 10,
            rpe: 8,
          })),
        },
      ],
    };
    const result = applyConservativeCoachSafety(
      {
        exerciseName: "Back Squat",
        primaryMuscleGroup: "quads",
        equipment: "barbell",
        notes: null,
        sets: [
          { setNumber: 1, reps: 8, weightKg: 85, restSeconds: 120, notes: null },
        ],
      },
      squat,
      [squatSession],
      "my quads are sore",
    );

    expect(result.exercise.sets[0].weightKg).toBe(80);
    expect(result.notes.join(" ")).toContain("kept conservative");
  });

  it("blocks increases globally for moderate structured soreness", () => {
    const result = applyConservativeCoachSafety(
      {
        exerciseName: "Bench Press",
        primaryMuscleGroup: "chest",
        equipment: "barbell",
        notes: null,
        sets: [
          { setNumber: 1, reps: 8, weightKg: 55, restSeconds: 90, notes: null },
        ],
      },
      bench,
      [
        {
          ...session,
          session_exercises: session.session_exercises.map((exercise) => ({
            ...exercise,
            session_sets: exercise.session_sets.map((set) => ({ ...set, rpe: 8 })),
          })),
        },
      ],
      "Energy: normal.\nMuscle soreness: moderate.\nAvailable time: 45 minutes.",
    );

    expect(result.exercise.sets[0].weightKg).toBe(50);
    expect(result.notes.join(" ")).toContain("kept conservative");
  });

  it("annotates matched and unmatched coach workout rows", () => {
    const workout = annotateCoachWorkout(
      {
        schemaVersion: 1,
        name: "Coach draft",
        rationale: null,
        exercises: [
          {
            exerciseName: "Bench Press",
            primaryMuscleGroup: "chest",
            equipment: "barbell",
            notes: null,
            sets: [
              { setNumber: 1, reps: 8, weightKg: 50, restSeconds: 90, notes: null },
            ],
          },
          {
            exerciseName: "Unknown Lift",
            primaryMuscleGroup: null,
            equipment: null,
            notes: null,
            sets: [
              { setNumber: 1, reps: 8, weightKg: null, restSeconds: 90, notes: null },
            ],
          },
        ],
      },
      [bench],
      [session],
      "normal day",
    );

    expect(workout.exercises[0].match.status).toBe("matched");
    expect(workout.exercises[1].match.status).toBe("unmatched");
  });

  it("uses a fallback draft without calling Gemini when no API key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "exercises") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({ data: [bench, squat], error: null }),
                ),
              })),
            })),
          };
        }

        if (table === "workout_templates") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [session], error: null })),
                })),
              })),
            })),
          })),
        };
      }),
    };

    const result = await generateCoachWorkout(
      supabase as never,
      "user-1",
      {
        energy: "low",
        muscleSoreness: "none",
        availableMinutes: 45,
        instruction: "",
      },
    );

    expect(result.schemaVersion).toBe(1);
    expect(result.exercises.length).toBeGreaterThan(0);
  });
});
