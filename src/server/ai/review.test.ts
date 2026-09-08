import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  Exercise,
  SessionWithDetails,
  TemplateExercise,
  WorkoutTemplate,
} from "@/lib/domain";
import { aiReviewSchema } from "@/lib/validation/schemas";
import {
  applyHardRuleOverrides,
  buildFallbackReview,
  buildPlanningContext,
  buildPrompt,
  getSuggestionValidationFailures,
  getAiReview,
  getSuggestionPlanningRange,
  isTemplateEquivalentSuggestion,
} from "@/server/ai/review";

const exercise: Exercise = {
  id: "33333333-3333-4333-8333-333333333333",
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
const fullBodyComplements: Exercise[] = [
  ["back", "55555555-5555-4555-8555-555555555555"],
  ["shoulders", "66666666-6666-4666-8666-666666666666"],
  ["quads", "77777777-7777-4777-8777-777777777777"],
  ["hamstrings", "88888888-8888-4888-8888-888888888888"],
  ["biceps", "99999999-9999-4999-8999-999999999999"],
  ["triceps", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
].map(([muscle, id]) => ({
  ...exercise,
  id,
  name: `${muscle} exercise`,
  primary_muscle_group: muscle,
  secondary_muscle_groups: [],
}));

const session: SessionWithDetails = {
  id: "22222222-2222-4222-8222-222222222222",
  template_id: "44444444-4444-4444-8444-444444444444",
  source_suggestion_id: null,
  name: "Workout A",
  status: "completed",
  performed_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  notes: null,
  session_exercises: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      session_id: "22222222-2222-4222-8222-222222222222",
      exercise_id: exercise.id,
      exercise_order: 1,
      planned_sets: 1,
      target_reps_min: 5,
      target_reps_max: 5,
      target_weight_kg: 50,
      rest_seconds: 120,
      notes: null,
      exercise,
      session_sets: [
        {
          id: crypto.randomUUID(),
          session_exercise_id: "11111111-1111-4111-8111-111111111111",
          set_number: 1,
          weight_kg: 50,
          reps: 5,
          rpe: 8,
          completed: true,
          note: null,
        },
      ],
    },
  ],
};

type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
};

function makeTemplate(
  id: string,
  name: string,
  sortOrder: number,
  templateExercise: Exercise,
): TemplateWithExercises {
  return {
    id,
    name,
    description: null,
    sort_order: sortOrder,
    is_active: true,
    workout_template_exercises: [
      {
        id: crypto.randomUUID(),
        template_id: id,
        exercise_id: templateExercise.id,
        exercise_order: 1,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        target_weight_kg: 30,
        target_set_weights_kg: [],
        rest_seconds: 90,
        notes: null,
        exercise: templateExercise,
      },
    ],
  };
}

function makeCompleteSuggestion(weightKg = 50) {
  return {
    sourceTemplateId: null,
    name: "Gemini Weekly Draft",
    rationale: "Complete full-body plan.",
    weeklyBalanceNotes: [],
    estimatedDurationMinutes: 48,
    exercises: [exercise, ...fullBodyComplements].map((item, index) => ({
      exerciseId: item.id,
      exerciseName: item.name,
      exerciseOrder: index + 1,
      target: {
        sets: 2,
        repsMin: 8,
        repsMax: 12,
        weightKg: index === 0 ? weightKg : 20,
        restSeconds: 90,
        notes: null,
      },
    })),
  };
}

describe("AI fallback review", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("matches the persisted JSON contract", () => {
    const review = buildFallbackReview(session);

    expect(aiReviewSchema.parse(review).schemaVersion).toBe(1);
    expect(review.exerciseDecisions[0].decision).toBe("increase");
  });

  it("builds the next session from a different active template", () => {
    const inclinePress = {
      ...exercise,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Incline Dumbbell Press",
    };
    const workoutB = makeTemplate(
      "66666666-6666-4666-8666-666666666666",
      "Workout B",
      2,
      inclinePress,
    );

    const review = buildFallbackReview(session, [workoutB]);

    expect(review.nextSessionSuggestion!.sourceTemplateId).toBe(workoutB.id);
    expect(review.nextSessionSuggestion!.name).not.toBe(workoutB.name);
    expect(review.nextSessionSuggestion!.name).not.toMatch(/^Workout [ABC]$/);
    expect(review.nextSessionSuggestion!.exercises.map((item) => item.exerciseId)).toEqual([
      inclinePress.id,
    ]);
    expect(review.nextSessionSuggestion!.exercises[0].target.weightKg).toBe(30);
  });

  it("uses a distinct suggestion name when repeating the completed workout", () => {
    const review = buildFallbackReview(session);

    expect(review.nextSessionSuggestion!.name).not.toMatch(/^Workout [ABC]$/);
  });

  it("does not match a template by a colliding display name when an id is present", () => {
    const namedLikeWorkoutB = {
      ...session,
      template_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Workout B",
    };
    const workoutB = makeTemplate(
      "66666666-6666-4666-8666-666666666666",
      "Workout B",
      1,
      exercise,
    );
    const workoutC = makeTemplate(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Workout C",
      2,
      exercise,
    );

    const review = buildFallbackReview(namedLikeWorkoutB, [workoutB, workoutC]);

    expect(review.nextSessionSuggestion!.sourceTemplateId).toBe(workoutB.id);
  });

  it("prefers the fallback template that closes a seven-ring deficit", () => {
    const coreOnly = {
      ...exercise,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Core Movement",
      primary_muscle_group: "core",
      secondary_muscle_groups: [],
    };
    const row = {
      ...exercise,
      id: "88888888-8888-4888-8888-888888888888",
      name: "Row",
      primary_muscle_group: "back",
      secondary_muscle_groups: [],
    };
    const workoutB = makeTemplate(
      "99999999-9999-4999-8999-999999999999",
      "Workout B",
      2,
      coreOnly,
    );
    const workoutC = makeTemplate(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "Workout C",
      3,
      row,
    );

    const review = buildFallbackReview(session, [workoutB, workoutC]);

    expect(review.nextSessionSuggestion!.sourceTemplateId).toBe(workoutC.id);
    expect(review.nextSessionSuggestion!.weeklyBalanceNotes[1]).toContain("Remaining");
  });

  it("includes earlier completed workouts in the same Singapore week prompt", () => {
    const wednesday = {
      ...session,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Workout B",
      performed_at: "2026-05-27T10:00:00+08:00",
    };
    const sunday = {
      ...session,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Workout A",
      performed_at: "2026-05-24T10:00:00+08:00",
    };
    const outsideWeek = {
      ...session,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "Prior week",
      performed_at: "2026-05-23T10:00:00+08:00",
    };
    const fallback = buildFallbackReview(wednesday);
    const context = buildPlanningContext(
      wednesday,
      [],
      [sunday, outsideWeek],
      [sunday, outsideWeek],
    );
    const prompt = buildPrompt(wednesday, fallback, context);

    expect(prompt).toContain('"name":"Workout A"');
    expect(prompt).toContain('"name":"Workout B"');
    expect(prompt).not.toContain('"name":"Prior week"');
    expect(prompt).toContain("chest 8-12");
  });

  it("does not give Gemini a deterministic workout draft or template sequence", () => {
    const alternate = {
      ...exercise,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Incline Dumbbell Press",
    };
    const workoutB = makeTemplate(
      "66666666-6666-4666-8666-666666666666",
      "Workout B",
      2,
      alternate,
    );
    const fallback = buildFallbackReview(session, [workoutB]);
    const context = buildPlanningContext(session, [workoutB], [session], [session]);
    const prompt = buildPrompt(session, fallback, context);

    expect(prompt).not.toContain("Active template references");
    expect(prompt).not.toContain("safest available fallback draft");
    expect(prompt).toContain("Deterministic conservative exerciseDecisions");
    expect(prompt).toContain("complete full-body session");
    expect(prompt).toContain("45-50 total minutes");
    expect(prompt).toContain("5-minute setup/personal warm-up buffer");
  });

  it("retains a valid Gemini workout draft and caps an unsafe proposed weight", () => {
    const fallback = buildFallbackReview(session);
    const context = buildPlanningContext(
      session,
      [],
      [session],
      [session],
      [exercise, ...fullBodyComplements],
    );
    const aiReview = {
      ...fallback,
      nextSessionSuggestion: makeCompleteSuggestion(100),
    };

    const safe = applyHardRuleOverrides(aiReview, fallback, context);

    expect(safe.nextSessionSuggestion!.name).toBe("Gemini Weekly Draft");
    expect(safe.nextSessionSuggestion!.exercises[0].target.weightKg).toBe(52.5);
  });

  it("keeps the existing hard-rule block on unsafe finished-session increases", () => {
    const painSession = {
      ...session,
      session_exercises: [
        {
          ...session.session_exercises[0],
          session_sets: [
            {
              ...session.session_exercises[0].session_sets[0],
              note: "sharp shoulder pain",
            },
          ],
        },
      ],
    };
    const fallback = buildFallbackReview(painSession);
    const aiReview = {
      ...fallback,
      exerciseDecisions: [
        {
          ...fallback.exerciseDecisions[0],
          decision: "increase" as const,
        },
      ],
    };

    const safe = applyHardRuleOverrides(aiReview, fallback);

    expect(safe.exerciseDecisions[0].decision).toBe("watch_pain");
  });

  it("saves no workout draft when Gemini selects an unknown exercise", () => {
    const fallback = buildFallbackReview(session);
    const context = buildPlanningContext(session, [], [session], [session]);
    const aiReview = {
      ...fallback,
      nextSessionSuggestion: {
        ...fallback.nextSessionSuggestion!,
        name: "Invalid Gemini Draft",
        exercises: [
          {
            ...fallback.nextSessionSuggestion!.exercises[0],
            exerciseId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          },
        ],
      },
    };

    const safe = applyHardRuleOverrides(aiReview, fallback, context);

    expect(safe.nextSessionSuggestion).toBeNull();
  });

  it("rejects a short deficit-only suggestion instead of accepting it as full body", () => {
    const context = buildPlanningContext(
      session,
      [],
      [session],
      [session],
      [exercise, ...fullBodyComplements],
    );
    const shortDraft = {
      ...makeCompleteSuggestion(50),
      estimatedDurationMinutes: 20,
      exercises: makeCompleteSuggestion(50).exercises.slice(0, 3),
    };

    expect(getSuggestionValidationFailures(shortDraft, context)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("estimated duration"),
        expect.stringContaining("missing primary full-body coverage"),
      ]),
    );
  });

  it("saves no workout draft when Gemini returns a template-equivalent exercise set", () => {
    const workoutB = makeTemplate(
      "66666666-6666-4666-8666-666666666666",
      "Workout B",
      2,
      exercise,
    );
    const fallback = buildFallbackReview(session, [workoutB]);
    const context = buildPlanningContext(session, [workoutB], [session], [session]);
    const safe = applyHardRuleOverrides(fallback, fallback, context);

    expect(safe.nextSessionSuggestion).toBeNull();
  });

  it("identifies a saved template copy even when Gemini reorders its exercises", () => {
    const alternative = {
      ...exercise,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Incline Dumbbell Press",
    };
    const workoutB = makeTemplate(
      "66666666-6666-4666-8666-666666666666",
      "Workout B",
      2,
      exercise,
    );
    workoutB.workout_template_exercises.push({
      ...workoutB.workout_template_exercises[0],
      id: "77777777-7777-4777-8777-777777777777",
      exercise_id: alternative.id,
      exercise_order: 2,
      exercise: alternative,
    });
    const context = buildPlanningContext(
      session,
      [workoutB],
      [session],
      [session],
      [exercise, alternative],
    );
    const suggestion = {
      sourceTemplateId: null,
      name: "Reordered copy",
      rationale: null,
      weeklyBalanceNotes: [],
      estimatedDurationMinutes: 48,
      exercises: [
        {
          exerciseId: alternative.id,
          exerciseName: alternative.name,
          exerciseOrder: 1,
          target: {
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            weightKg: 30,
            restSeconds: 90,
            notes: null,
          },
        },
        {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exerciseOrder: 2,
          target: {
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            weightKg: 30,
            restSeconds: 90,
            notes: null,
          },
        },
      ],
    };

    expect(isTemplateEquivalentSuggestion(suggestion, context)).toBe(true);
  });

  it("asks Gemini once to redesign a template-equivalent suggestion", async () => {
    const alternative = {
      ...exercise,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Incline Dumbbell Press",
    };
    const workoutB = makeTemplate(
      "66666666-6666-4666-8666-666666666666",
      "Workout B",
      2,
      exercise,
    );
    const fallback = {
      ...buildFallbackReview(session),
      nextSessionSuggestion: null,
    };
    const context = buildPlanningContext(
      session,
      [workoutB],
      [session],
      [session],
      [exercise, alternative],
    );
    const templateCopy = {
      ...fallback,
      nextSessionSuggestion: {
        sourceTemplateId: workoutB.id,
        name: "Copied Draft",
        rationale: "First attempt.",
        weeklyBalanceNotes: [],
        estimatedDurationMinutes: 48,
        exercises: [
          {
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            exerciseOrder: 1,
            target: {
              sets: 3,
              repsMin: 8,
              repsMax: 12,
              weightKg: 50,
              restSeconds: 90,
              notes: null,
            },
          },
        ],
      },
    };
    const redesigned = {
      ...templateCopy,
      nextSessionSuggestion: {
        ...templateCopy.nextSessionSuggestion,
        sourceTemplateId: null,
        name: "New Draft",
        exercises: [
          {
            ...templateCopy.nextSessionSuggestion.exercises[0],
            exerciseId: alternative.id,
            exerciseName: alternative.name,
          },
        ],
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse(templateCopy))
      .mockResolvedValueOnce(geminiResponse(redesigned));
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);

    const response = await getAiReview(session, fallback, context);
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: { temperature: number };
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.nextSessionSuggestion!.name).toBe("New Draft");
    expect(secondRequest.generationConfig.temperature).toBe(0.2);
    expect(secondRequest.contents[0].parts[0].text).toContain("Correction required");
  });

  it("asks Gemini to redesign an incomplete out-of-time draft", async () => {
    const fallback = {
      ...buildFallbackReview(session),
      nextSessionSuggestion: null,
    };
    const context = buildPlanningContext(
      session,
      [],
      [session],
      [session],
      [exercise, ...fullBodyComplements],
    );
    const incomplete = {
      ...fallback,
      nextSessionSuggestion: {
        ...makeCompleteSuggestion(),
        estimatedDurationMinutes: 20,
        exercises: makeCompleteSuggestion().exercises.slice(0, 3),
      },
    };
    const complete = {
      ...fallback,
      nextSessionSuggestion: makeCompleteSuggestion(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse(incomplete))
      .mockResolvedValueOnce(geminiResponse(complete));
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);

    const response = await getAiReview(session, fallback, context);
    const corrected = applyHardRuleOverrides(response, fallback, context);
    const correctionBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(correctionBody.contents[0].parts[0].text).toContain(
      "missing primary full-body coverage",
    );
    expect(corrected.nextSessionSuggestion!.estimatedDurationMinutes).toBe(48);
  });

  it("treats Friday completion as history for a fresh Sunday planning week", () => {
    const friday = {
      ...session,
      performed_at: "2026-05-29T10:00:00+08:00",
    };
    const range = getSuggestionPlanningRange(friday, [friday]);
    const context = buildPlanningContext(friday, [], [friday], [], [exercise], range);

    expect(range.weekStart.toISOString()).toBe("2026-05-30T16:00:00.000Z");
    expect(context.weeklySessions).toEqual([]);
    expect(context.planningPhase).toBe("first_exposure");
    expect(context.targetSessionType).toBe("sunday");
    expect(context.durationMinimumMinutes).toBe(55);
    expect(context.durationMaximumMinutes).toBe(70);
  });

  it("plans Wednesday as the first completed workout when Sunday was skipped", () => {
    const wednesday = {
      ...session,
      performed_at: "2026-05-27T10:00:00+08:00",
    };
    const range = getSuggestionPlanningRange(wednesday, [wednesday]);
    const context = buildPlanningContext(
      wednesday,
      [],
      [wednesday],
      [wednesday],
      [exercise],
      range,
    );

    expect(range.weekStart.toISOString()).toBe("2026-05-23T16:00:00.000Z");
    expect(context.weeklySessions).toHaveLength(1);
    expect(context.planningPhase).toBe("close_minimums");
    expect(context.targetSessionType).toBe("weekday");
    expect(context.durationMinimumMinutes).toBe(45);
    expect(context.durationMaximumMinutes).toBe(50);
  });

  it("uses Thursday for catch-up only when fewer than two workouts were completed", () => {
    const sunday = {
      ...session,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      performed_at: "2026-05-24T10:00:00+08:00",
    };
    const thursday = {
      ...session,
      id: "99999999-9999-4999-8999-999999999998",
      performed_at: "2026-05-28T10:00:00+08:00",
    };

    expect(getSuggestionPlanningRange(thursday, [thursday]).weekStart.toISOString()).toBe(
      "2026-05-23T16:00:00.000Z",
    );
    expect(
      getSuggestionPlanningRange(thursday, [sunday, thursday]).weekStart.toISOString(),
    ).toBe("2026-05-30T16:00:00.000Z");
  });

  it("does not create a draft when no exercise is enabled for AI suggestions", () => {
    const disabledSession = {
      ...session,
      session_exercises: session.session_exercises.map((entry) => ({
        ...entry,
        exercise: {
          ...entry.exercise,
          is_ai_suggestion_enabled: false,
        },
      })),
    };

    expect(buildFallbackReview(disabledSession).nextSessionSuggestion).toBeNull();
  });
});

function geminiResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  };
}
