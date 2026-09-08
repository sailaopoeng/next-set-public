import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Exercise, SessionWithDetails } from "@/lib/domain";
import { findExerciseReplacements } from "@/server/exercise-replacements/replacements";
import {
  listAllCompletedSessionDetails,
  listExercises,
  listTemplates,
} from "@/server/db/queries";

vi.mock("@/server/db/queries", () => ({
  listAllCompletedSessionDetails: vi.fn(),
  listExercises: vi.fn(),
  listTemplates: vi.fn(),
}));

const sourceExercise = makeExercise({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bench Press",
  primary: "chest",
  equipment: "barbell",
  category: "barbell_upper",
  enabled: true,
});

describe("exercise replacements", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(listAllCompletedSessionDetails).mockResolvedValue([]);
  });

  it("includes imported AI-disabled exercises when they are common same-muscle options", async () => {
    const imported = makeExercise({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Dumbbell Bench Press",
      primary: "chest",
      equipment: "dumbbell",
      category: "dumbbell_upper",
      enabled: false,
    });
    const odd = makeExercise({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Barbell Guillotine Bench Press",
      primary: "chest",
      equipment: "barbell",
      category: "barbell_upper",
      enabled: false,
    });
    const row = makeExercise({
      id: "44444444-4444-4444-8444-444444444444",
      name: "Seated Cable Row",
      primary: "back",
      equipment: "cable",
      category: "machine",
      enabled: true,
    });
    vi.mocked(listExercises).mockResolvedValue([
      sourceExercise,
      odd,
      imported,
      row,
    ]);

    const replacements = await findExerciseReplacements({} as SupabaseClient, "user-1", {
      sourceExerciseId: sourceExercise.id,
      excludeExerciseIds: [],
      seenExerciseIds: [],
      currentTarget: target(),
      contextType: "session",
    });

    expect(replacements.map((candidate) => candidate.exercise.id)).toContain(
      imported.id,
    );
    expect(replacements.map((candidate) => candidate.exercise.id)).not.toContain(
      row.id,
    );
    expect(replacements[0].exercise.name).toBe("Dumbbell Bench Press");
  });

  it("skips already-present and already-seen exercise ids", async () => {
    const first = makeExercise({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Dumbbell Bench Press",
      primary: "chest",
      equipment: "dumbbell",
      category: "dumbbell_upper",
      enabled: true,
    });
    const second = makeExercise({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Incline Dumbbell Press",
      primary: "chest",
      equipment: "dumbbell",
      category: "dumbbell_upper",
      enabled: true,
    });
    vi.mocked(listExercises).mockResolvedValue([sourceExercise, first, second]);

    const replacements = await findExerciseReplacements({} as SupabaseClient, "user-1", {
      sourceExerciseId: sourceExercise.id,
      excludeExerciseIds: [first.id],
      seenExerciseIds: [],
      currentTarget: target(),
      contextType: "suggestion",
    });

    expect(replacements.map((candidate) => candidate.exercise.id)).toEqual([
      second.id,
    ]);
  });

  it("uses conservative history progression for replacement targets", async () => {
    const replacement = makeExercise({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Dumbbell Bench Press",
      primary: "chest",
      equipment: "dumbbell",
      category: "dumbbell_upper",
      enabled: true,
    });
    vi.mocked(listExercises).mockResolvedValue([sourceExercise, replacement]);
    vi.mocked(listAllCompletedSessionDetails).mockResolvedValue([
      makeHistorySession(replacement),
    ]);

    const replacements = await findExerciseReplacements({} as SupabaseClient, "user-1", {
      sourceExerciseId: sourceExercise.id,
      excludeExerciseIds: [],
      seenExerciseIds: [],
      currentTarget: target(),
      contextType: "session",
    });

    expect(replacements[0].target.weightKg).toBe(22);
    expect(replacements[0].reasonTags).toContain("from history");
  });
});

function makeExercise({
  id,
  name,
  primary,
  equipment,
  category,
  enabled,
}: {
  id: string;
  name: string;
  primary: string;
  equipment: string;
  category: Exercise["lift_category"];
  enabled: boolean;
}): Exercise {
  return {
    id,
    name,
    primary_muscle_group: primary,
    secondary_muscle_groups: ["triceps"],
    equipment,
    lift_category: category,
    default_increment_kg: category === "dumbbell_upper" ? 2 : 2.5,
    is_main_lift: false,
    is_ai_suggestion_enabled: enabled,
    volume_multiplier: 1,
    notes: null,
  };
}

function target() {
  return {
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    weightKg: 50,
    restSeconds: 120,
    notes: null,
  };
}

function makeHistorySession(exercise: Exercise): SessionWithDetails {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    template_id: null,
    source_suggestion_id: null,
    name: "History",
    status: "completed",
    performed_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    notes: null,
    session_exercises: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        session_id: "55555555-5555-4555-8555-555555555555",
        exercise_id: exercise.id,
        exercise_order: 1,
        planned_sets: 2,
        target_reps_min: 8,
        target_reps_max: 10,
        target_weight_kg: 20,
        rest_seconds: 90,
        notes: null,
        exercise,
        session_sets: [
          {
            id: crypto.randomUUID(),
            session_exercise_id: "66666666-6666-4666-8666-666666666666",
            set_number: 1,
            weight_kg: 20,
            reps: 10,
            rpe: 8,
            completed: true,
            note: null,
          },
          {
            id: crypto.randomUUID(),
            session_exercise_id: "66666666-6666-4666-8666-666666666666",
            set_number: 2,
            weight_kg: 20,
            reps: 10,
            rpe: 8,
            completed: true,
            note: null,
          },
        ],
      },
    ],
  };
}
