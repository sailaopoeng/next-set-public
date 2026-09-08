import { describe, expect, it } from "vitest";

import {
  coachRequestSchema,
  liveSessionSyncSchema,
  startSessionSchema,
} from "@/lib/validation/schemas";

const exerciseId = "11111111-1111-4111-8111-111111111111";
const secondExerciseId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";

describe("startSessionSchema", () => {
  it("accepts prepared session drafts", () => {
    const parsed = startSessionSchema.safeParse({
      prepared: {
        name: "Prepared workout",
        sourceTemplateId: null,
        notes: "Keep it conservative.",
        exercises: [
          {
            exerciseId,
            exerciseOrder: 1,
            targetSets: 3,
            targetRepsMin: 8,
            targetRepsMax: 12,
            targetWeightKg: 40,
            targetSetWeightsKg: [37.5, 40, 40],
            restSeconds: 120,
            notes: null,
          },
          {
            exerciseId: secondExerciseId,
            exerciseOrder: 2,
            targetSets: 2,
            targetRepsMin: 10,
            targetRepsMax: 15,
            targetWeightKg: null,
            targetSetWeightsKg: [],
            restSeconds: 90,
            notes: "Easy accessory.",
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects prepared sessions without exercises", () => {
    const parsed = startSessionSchema.safeParse({
      prepared: {
        name: "Prepared workout",
        sourceTemplateId: null,
        notes: null,
        exercises: [],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate prepared exercise ids", () => {
    const parsed = startSessionSchema.safeParse({
      prepared: {
        name: "Prepared workout",
        sourceTemplateId: null,
        notes: null,
        exercises: [preparedExercise(exerciseId, 1), preparedExercise(exerciseId, 2)],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid prepared rep ranges", () => {
    const parsed = startSessionSchema.safeParse({
      prepared: {
        name: "Prepared workout",
        sourceTemplateId: null,
        notes: null,
        exercises: [
          {
            ...preparedExercise(exerciseId, 1),
            targetRepsMin: 12,
            targetRepsMax: 8,
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects more set weights than prepared sets", () => {
    const parsed = startSessionSchema.safeParse({
      prepared: {
        name: "Prepared workout",
        sourceTemplateId: null,
        notes: null,
        exercises: [
          {
            ...preparedExercise(exerciseId, 1),
            targetSets: 2,
            targetSetWeightsKg: [20, 22.5, 25],
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts adjacent superset pairs with matching sets and rest", () => {
    const first = { ...preparedExercise(exerciseId, 1), supersetGroupId: groupId };
    const second = {
      ...preparedExercise(secondExerciseId, 2),
      supersetGroupId: groupId,
    };

    expect(
      startSessionSchema.safeParse({
        prepared: {
          name: "Arms",
          sourceTemplateId: null,
          notes: null,
          exercises: [first, second],
        },
      }).success,
    ).toBe(true);
  });

  it("rejects incomplete or mismatched superset pairs", () => {
    const first = { ...preparedExercise(exerciseId, 1), supersetGroupId: groupId };
    const mismatched = {
      ...preparedExercise(secondExerciseId, 2),
      targetSets: 2,
      targetSetWeightsKg: [20, 20],
      supersetGroupId: groupId,
    };
    const prepared = (exercises: object[]) => ({
      prepared: {
        name: "Arms",
        sourceTemplateId: null,
        notes: null,
        exercises,
      },
    });

    expect(startSessionSchema.safeParse(prepared([first])).success).toBe(false);
    expect(startSessionSchema.safeParse(prepared([first, mismatched])).success).toBe(false);
  });
});

describe("coachRequestSchema", () => {
  it("accepts the default structured inputs without a coach note", () => {
    const parsed = coachRequestSchema.safeParse({
      energy: "normal",
      muscleSoreness: "none",
      availableMinutes: 45,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.instruction).toBe("");
  });

  it("rejects unsupported structured inputs", () => {
    expect(
      coachRequestSchema.safeParse({
        energy: "normal",
        muscleSoreness: "mild",
        availableMinutes: 20,
      }).success,
    ).toBe(false);
  });
});

describe("liveSessionSyncSchema", () => {
  it("accepts a complete live workout snapshot", () => {
    expect(
      liveSessionSyncSchema.safeParse({
        performedAt: "2026-08-29T09:00:00.000Z",
        notes: "Autosaved",
        exercises: [liveExercise(exerciseId, 1)],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate exercises and non-contiguous set numbers", () => {
    const duplicate = liveExercise(exerciseId, 2);
    duplicate.sets[0].setNumber = 2;

    expect(
      liveSessionSyncSchema.safeParse({
        performedAt: "2026-08-29T09:00:00.000Z",
        notes: null,
        exercises: [liveExercise(exerciseId, 1), duplicate],
      }).success,
    ).toBe(false);
  });
});

function preparedExercise(id: string, order: number) {
  return {
    exerciseId: id,
    exerciseOrder: order,
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeightKg: 20,
    targetSetWeightsKg: [20, 20, 20],
    restSeconds: 120,
    notes: null,
  };
}

function liveExercise(id: string, order: number) {
  return {
    id: order === 1
      ? "44444444-4444-4444-8444-444444444444"
      : "55555555-5555-4555-8555-555555555555",
    exerciseId: id,
    exerciseOrder: order,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeightKg: 20,
    restSeconds: 90,
    supersetGroupId: null,
    notes: null,
    sets: [
      {
        id: order === 1
          ? "66666666-6666-4666-8666-666666666666"
          : "77777777-7777-4777-8777-777777777777",
        setNumber: 1,
        weightKg: 20,
        reps: 10,
        rpe: 7,
        completed: true,
        note: null,
      },
    ],
  };
}
