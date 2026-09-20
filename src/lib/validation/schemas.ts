import { z } from "zod";

import { DECISIONS } from "@/lib/domain";
import { WEEKLY_MUSCLE_GROUPS } from "@/lib/weekly-targets";

export const templateExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  exerciseOrder: z.number().int().min(1),
  targetSets: z.number().int().min(1).max(12),
  targetRepsMin: z.number().int().min(1).max(100),
  targetRepsMax: z.number().int().min(1).max(100),
  targetWeightKg: z.number().min(0).max(1000).nullable(),
  targetSetWeightsKg: z.array(z.number().min(0).max(1000).nullable()).max(12),
  restSeconds: z.number().int().min(0).max(900),
  supersetGroupId: z.string().uuid().nullable().default(null),
  notes: z.string().max(1000).nullable(),
});

function hasValidSupersetPairs(
  exercises: z.infer<typeof templateExerciseSchema>[],
) {
  const groups = Map.groupBy(
    exercises.filter((exercise) => exercise.supersetGroupId !== null),
    (exercise) => exercise.supersetGroupId as string,
  );

  return [...groups.values()].every(
    ([first, second, ...rest]) =>
      Boolean(first) &&
      Boolean(second) &&
      rest.length === 0 &&
      Math.abs(first.exerciseOrder - second.exerciseOrder) === 1 &&
      first.targetSets === second.targetSets &&
      first.restSeconds === second.restSeconds,
  );
}

export const preparedSessionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sourceTemplateId: z.string().uuid().nullable(),
  notes: z.string().trim().max(2000).nullable(),
  exercises: z
    .array(templateExerciseSchema)
    .min(1)
    .max(20)
    .refine((exercises) => {
      const exerciseIds = new Set(exercises.map((exercise) => exercise.exerciseId));
      return exerciseIds.size === exercises.length;
    }, "Prepared session cannot include duplicate exercises.")
    .refine(
      (exercises) =>
        exercises.every(
          (exercise) => exercise.targetRepsMax >= exercise.targetRepsMin,
        ),
      "Target rep max must be greater than or equal to target rep min.",
    )
    .refine(
      (exercises) =>
        exercises.every(
          (exercise) => exercise.targetSetWeightsKg.length <= exercise.targetSets,
        ),
      "Prepared set weights cannot exceed the planned set count.",
    )
    .refine(hasValidSupersetPairs, "Supersets must be adjacent pairs with matching sets and rest."),
});

export const templateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable(),
  sortOrder: z.number().int().min(1).max(100),
  isActive: z.boolean(),
  exercises: z
    .array(templateExerciseSchema)
    .min(1)
    .max(20)
    .refine(hasValidSupersetPairs, "Supersets must be adjacent pairs with matching sets and rest."),
});

export const exerciseUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  primaryMuscleGroup: z.string().trim().min(1).max(80),
  secondaryMuscleGroups: z.array(z.string().trim().min(1).max(80)).max(12),
  equipment: z.string().trim().max(80).nullable(),
  liftCategory: z.enum([
    "barbell_upper",
    "dumbbell_upper",
    "lower_compound",
    "machine",
    "bodyweight",
    "accessory",
    "core",
    "conditioning",
    "other",
  ]),
  defaultIncrementKg: z.number().min(0).max(50),
  isMainLift: z.boolean(),
  isAiSuggestionEnabled: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullable(),
});

export const exerciseSettingsUpdateSchema = z
  .object({
    isAiSuggestionEnabled: z.boolean().optional(),
    volumeMultiplier: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .strict()
  .refine(
    (settings) =>
      settings.isAiSuggestionEnabled !== undefined ||
      settings.volumeMultiplier !== undefined,
    "At least one exercise setting is required.",
  );

const weeklyTargetRangeSchema = z
  .object({
    minimum: z.number().min(0.5).max(50).multipleOf(0.5),
    maximum: z.number().min(0.5).max(50).multipleOf(0.5),
  })
  .strict()
  .refine((range) => range.maximum >= range.minimum, {
    message: "Maximum must be greater than or equal to minimum.",
  });

export const weeklyMuscleTargetsUpdateSchema = z
  .object(Object.fromEntries(
    WEEKLY_MUSCLE_GROUPS.map((muscleGroup) => [muscleGroup, weeklyTargetRangeSchema]),
  ) as Record<(typeof WEEKLY_MUSCLE_GROUPS)[number], typeof weeklyTargetRangeSchema>)
  .strict();

export const weeklyWorkoutTargetUpdateSchema = z.object({
  target: z.number().int().min(1).max(14),
}).strict();

export const weeklyAnalysisRequestSchema = z.object({
  weekStart: z.string().date(),
}).strict();

export const deloadWeekRequestSchema = z.object({
  weekStart: z.string().date(),
  source: z.enum(["manual", "ai_recommendation"]).default("manual"),
}).strict();

export const weeklyAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  weekStart: z.string().date(),
  weekEnd: z.string().date(),
  comparisonWeekStart: z.string().date(),
  comparisonWeekEnd: z.string().date(),
  isCurrentWeek: z.boolean(),
  workoutsCompleted: z.number().int().min(0),
  workoutTarget: z.number().int().min(1).max(14),
  targetSnapshot: weeklyMuscleTargetsUpdateSchema,
  summary: z.string().trim().min(1).max(700),
  observations: z.array(z.string().trim().min(1).max(300)).max(6),
  nextWeekActions: z.array(z.object({
    id: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(500),
  })).max(6),
  deload: z.object({
    recommended: z.boolean(),
    confirmedForSelectedWeek: z.boolean(),
    confirmedForNextWeek: z.boolean(),
    reasons: z.array(z.string().trim().min(1).max(300)).max(5),
  }),
});

export const startSessionSchema = z.union([
  z.object({ templateId: z.string().uuid() }).strict(),
  z.object({ suggestionId: z.string().uuid() }).strict(),
  z.object({ empty: z.literal(true) }).strict(),
  z.object({ prepared: preparedSessionSchema }).strict(),
]);

export const setInputSchema = z.object({
  id: z.string().uuid().optional(),
  sessionExerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(20),
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(200),
  rpe: z.number().min(1).max(10).nullable(),
  completed: z.boolean(),
  note: z.string().trim().max(1000).nullable(),
});

export const setUpsertSchema = z.object({
  sets: z.array(setInputSchema).min(1).max(200),
});

const liveSessionSetSchema = z.object({
  id: z.string().uuid(),
  setNumber: z.number().int().min(1).max(12),
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(200),
  rpe: z.number().min(1).max(10).nullable(),
  completed: z.boolean(),
  note: z.string().trim().max(1000).nullable(),
});

const liveSessionExerciseSchema = z.object({
  id: z.string().uuid(),
  exerciseId: z.string().uuid(),
  exerciseOrder: z.number().int().min(1).max(30),
  targetRepsMin: z.number().int().min(1).max(100),
  targetRepsMax: z.number().int().min(1).max(100),
  targetWeightKg: z.number().min(0).max(1000).nullable(),
  restSeconds: z.number().int().min(0).max(900),
  supersetGroupId: z.string().uuid().nullable(),
  notes: z.string().trim().max(1000).nullable(),
  sets: z.array(liveSessionSetSchema).min(1).max(12),
}).refine(
  (exercise) => exercise.targetRepsMax >= exercise.targetRepsMin,
  "Target rep max must be greater than or equal to target rep min.",
).refine(
  (exercise) =>
    exercise.sets.every((set, index) => set.setNumber === index + 1),
  "Set numbers must be contiguous and start at one.",
).refine(
  (exercise) =>
    new Set(exercise.sets.map((set) => set.id)).size === exercise.sets.length,
  "Set IDs must be unique within an exercise.",
);

export const liveSessionSyncSchema = z.object({
  performedAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable(),
  exercises: z.array(liveSessionExerciseSchema).max(30),
}).refine(
  (payload) =>
    new Set(payload.exercises.map((exercise) => exercise.id)).size ===
    payload.exercises.length,
  "Session exercise IDs must be unique.",
).refine(
  (payload) =>
    new Set(payload.exercises.map((exercise) => exercise.exerciseId)).size ===
    payload.exercises.length,
  "A live session cannot include duplicate exercises.",
).refine(
  (payload) =>
    payload.exercises.every(
      (exercise, index) => exercise.exerciseOrder === index + 1,
    ),
  "Exercise order must be contiguous and start at one.",
).refine(
  (payload) => {
    const setIds = payload.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => set.id),
    );
    return new Set(setIds).size === setIds.length;
  },
  "Set IDs must be unique within a workout.",
).refine(
  (payload) => {
    const groups = Map.groupBy(
      payload.exercises.filter((exercise) => exercise.supersetGroupId !== null),
      (exercise) => exercise.supersetGroupId as string,
    );

    return [...groups.values()].every(
      ([first, second, ...rest]) =>
        Boolean(first) &&
        Boolean(second) &&
        rest.length === 0 &&
        Math.abs(first.exerciseOrder - second.exerciseOrder) === 1 &&
        first.sets.length === second.sets.length &&
        first.restSeconds === second.restSeconds,
    );
  },
  "Supersets must be adjacent pairs with matching sets and rest.",
);

export const sessionExerciseAddSchema = z.object({
  exerciseId: z.string().uuid(),
  sessionExerciseId: z.string().uuid().optional(),
  initialSetId: z.string().uuid().optional(),
});

export const exerciseOrderSchema = z.object({
  exerciseIds: z
    .array(z.string().uuid())
    .min(1)
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Exercise order must contain unique exercise IDs.",
    }),
});

export const sessionSupersetUpdateSchema = z.object({
  supersetGroups: z
    .array(
      z.object({
        groupId: z.string().uuid(),
        exerciseIds: z.tuple([z.string().uuid(), z.string().uuid()]),
        restSeconds: z.number().int().min(0).max(900),
      }),
    )
    .max(15)
    .refine(
      (groups) => {
        const groupIds = groups.map((group) => group.groupId);
        const exerciseIds = groups.flatMap((group) => group.exerciseIds);
        return (
          new Set(groupIds).size === groupIds.length &&
          new Set(exerciseIds).size === exerciseIds.length
        );
      },
      "Superset groups and exercise membership must be unique.",
    ),
});

export const sessionSetAddSchema = z.object({
  sessionExerciseId: z.string().uuid(),
  setId: z.string().uuid().optional(),
  partnerSetId: z.string().uuid().optional(),
});

export const sessionMetadataUpdateSchema = z.object({
  performedAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable(),
});

export const finishSessionSchema = z.object({
  performedAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable(),
});

export const suggestedTargetSchema = z.object({
  sets: z.number().int().min(1).max(12),
  repsMin: z.number().int().min(1).max(100),
  repsMax: z.number().int().min(1).max(100),
  weightKg: z.number().min(0).max(1000).nullable(),
  restSeconds: z.number().int().min(0).max(900),
  notes: z.string().trim().max(1000).nullable(),
});

export const exerciseReplacementRequestSchema = z.object({
  sourceExerciseId: z.string().uuid(),
  excludeExerciseIds: z.array(z.string().uuid()).max(30).default([]),
  seenExerciseIds: z.array(z.string().uuid()).max(100).default([]),
  currentTarget: suggestedTargetSchema,
  contextType: z.enum(["session", "suggestion", "prep"]),
});

export const exerciseReplacementApplySchema = z.object({
  replacementExerciseId: z.string().uuid(),
  target: suggestedTargetSchema,
});

export const coachRequestSchema = z
  .object({
    energy: z.enum(["low", "normal", "high"]),
    muscleSoreness: z.enum(["none", "moderate", "severe"]),
    availableMinutes: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.literal(75),
    ]),
    instruction: z.string().trim().max(1000).default(""),
    retryToken: z.string().trim().max(100).optional(),
  })
  .strict();

export const coachWorkoutSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(100),
  rationale: z.string().trim().max(700).nullable(),
  exercises: z
    .array(
      z.object({
        exerciseName: z.string().trim().min(1).max(120),
        primaryMuscleGroup: z.string().trim().max(80).nullable().optional(),
        equipment: z.string().trim().max(80).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
        sets: z
          .array(
            z.object({
              setNumber: z.number().int().min(1).max(12),
              reps: z.number().int().min(1).max(100),
              weightKg: z.number().min(0).max(1000).nullable(),
              restSeconds: z.number().int().min(0).max(900).nullable().optional(),
              notes: z.string().trim().max(500).nullable().optional(),
            }),
          )
          .min(1)
          .max(12),
      }),
    )
    .min(1)
    .max(20),
});

export const aiReviewSchema = z.object({
  schemaVersion: z.literal(1),
  sessionSummary: z.string().trim().min(1).max(700),
  exerciseDecisions: z.array(
    z.object({
      sessionExerciseId: z.string().uuid(),
      exerciseName: z.string().trim().min(1).max(120),
      decision: z.enum(DECISIONS),
      reason: z.string().trim().min(1).max(500),
      suggestedTarget: suggestedTargetSchema,
    }),
  ),
  nextSessionSuggestion: z.object({
    sourceTemplateId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(100),
    rationale: z.string().trim().max(700).nullable(),
    weeklyBalanceNotes: z.array(z.string().trim().min(1).max(240)).max(8),
    estimatedDurationMinutes: z.number().int().min(1).max(180),
    exercises: z.array(
      z.object({
        exerciseId: z.string().uuid(),
        exerciseName: z.string().trim().min(1).max(120),
        exerciseOrder: z.number().int().min(1).max(30),
        target: suggestedTargetSchema,
      }),
    ),
  }).nullable(),
});

export type AiReviewPayload = z.infer<typeof aiReviewSchema>;
export type CoachRequestPayload = z.infer<typeof coachRequestSchema>;
export type CoachWorkoutPayload = z.infer<typeof coachWorkoutSchema>;
