import { describe, expect, it } from "vitest";

import type { Exercise, SessionWithDetails } from "@/lib/domain";
import {
  buildExerciseDetailAnalytics,
  buildDashboardAnalytics,
  getSundayWeekRangeSingapore,
} from "@/server/analytics/calculations";
import { DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS } from "@/lib/weekly-targets";

const exercise: Exercise = {
  id: "exercise-1",
  name: "Back Squat",
  primary_muscle_group: "quads",
  secondary_muscle_groups: ["glutes"],
  equipment: "barbell",
  lift_category: "lower_compound",
  default_increment_kg: 5,
  is_main_lift: true,
  is_ai_suggestion_enabled: true,
  volume_multiplier: 1,
  notes: null,
};

function session(performedAt: string): SessionWithDetails {
  return {
    id: crypto.randomUUID(),
    template_id: null,
    source_suggestion_id: null,
    name: "Workout A",
    status: "completed",
    performed_at: performedAt,
    started_at: performedAt,
    finished_at: performedAt,
    notes: null,
    session_exercises: [
      {
        id: crypto.randomUUID(),
        session_id: "session",
        exercise_id: exercise.id,
        exercise_order: 1,
        planned_sets: 1,
        target_reps_min: 5,
        target_reps_max: 8,
        target_weight_kg: 100,
        rest_seconds: 180,
        notes: null,
        exercise,
        session_sets: [
          {
            id: crypto.randomUUID(),
            session_exercise_id: "session-exercise",
            set_number: 1,
            weight_kg: 100,
            reps: 5,
            rpe: 8,
            completed: true,
            note: null,
          },
        ],
      },
    ],
  };
}

describe("analytics calculations", () => {
  it("uses Sunday as week start in Singapore time", () => {
    const range = getSundayWeekRangeSingapore(
      new Date("2026-05-24T12:00:00+08:00"),
    );

    expect(range.weekStart.toISOString()).toBe("2026-05-23T16:00:00.000Z");
  });

  it("calculates weekly volume and records", () => {
    const analytics = buildDashboardAnalytics(
      [session("2026-05-24T10:00:00+08:00")],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.weeklyWorkoutCount).toBe(1);
    expect(analytics.totalSets).toBe(1);
    expect(analytics.totalVolume).toBe(500);
    expect(analytics.volumeByMuscleGroup[0]).toEqual({
      muscleGroup: "quads",
      volume: 500,
    });
    expect(analytics.personalRecords.highestEstimatedOneRepMax).toMatchObject({
      value: 116.5,
      exerciseName: "Back Squat",
      sessionName: "Workout A",
      performedAt: "2026-05-24T10:00:00+08:00",
    });
  });

  it("doubles volume without changing strength records", () => {
    const workout = session("2026-05-24T10:00:00+08:00");
    workout.session_exercises[0].exercise = {
      ...exercise,
      name: "Dumbbell Shoulder Press",
      volume_multiplier: 2,
    };
    workout.session_exercises[0].session_sets[0].weight_kg = 15;
    workout.session_exercises[0].session_sets[0].reps = 10;

    const analytics = buildDashboardAnalytics(
      [workout],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.totalVolume).toBe(300);
    expect(analytics.volumeByMuscleGroup[0]?.volume).toBe(300);
    expect(analytics.personalRecords.heaviestCompletedSet?.value).toBe(15);
    expect(analytics.personalRecords.highestEstimatedOneRepMax?.value).toBe(20);
  });

  it("uses performed_at for Sunday Singapore week membership", () => {
    const analytics = buildDashboardAnalytics(
      [
        session("2026-05-24T08:00:00+08:00"),
        session("2026-05-23T23:30:00+08:00"),
      ],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.weeklyWorkoutCount).toBe(1);
  });

  it("counts fractional secondary sets for tracked compound muscles", () => {
    const bench = {
      ...exercise,
      name: "Bench Press",
      primary_muscle_group: "chest",
      secondary_muscle_groups: ["shoulders", "triceps"],
    };
    const workout = session("2026-05-24T10:00:00+08:00");
    workout.session_exercises[0].exercise = bench;
    const analytics = buildDashboardAnalytics(
      [workout],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.muscleSetProgress.find((item) => item.muscleGroup === "chest")?.sets).toBe(1);
    expect(analytics.muscleSetProgress.find((item) => item.muscleGroup === "shoulders")?.sets).toBe(0.5);
    expect(analytics.muscleSetProgress.find((item) => item.muscleGroup === "triceps")?.sets).toBe(0);
  });

  it("normalizes legacy muscle aliases when counting weekly rings", () => {
    const shoulderWorkout = session("2026-05-24T10:00:00+08:00");
    shoulderWorkout.session_exercises[0].exercise = {
      ...exercise,
      primary_muscle_group: "Shoulder",
    };
    const analytics = buildDashboardAnalytics(
      [shoulderWorkout],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(
      analytics.muscleSetProgress.find((item) => item.muscleGroup === "shoulders")
        ?.sets,
    ).toBe(1);
  });

  it("marks muscle target states including above-range direct arm work", () => {
    const curl = {
      ...exercise,
      name: "Curl",
      primary_muscle_group: "biceps",
      secondary_muscle_groups: [],
    };
    const workout = session("2026-05-24T10:00:00+08:00");
    workout.session_exercises[0].exercise = curl;
    workout.session_exercises[0].session_sets = Array.from({ length: 9 }, () => ({
      ...workout.session_exercises[0].session_sets[0],
      id: crypto.randomUUID(),
    }));
    const analytics = buildDashboardAnalytics(
      [workout],
      new Date("2026-05-25T10:00:00+08:00"),
    );
    const biceps = analytics.muscleSetProgress.find(
      (item) => item.muscleGroup === "biceps",
    );
    const hamstrings = analytics.muscleSetProgress.find(
      (item) => item.muscleGroup === "hamstrings",
    );

    expect(biceps).toMatchObject({ sets: 9, minimum: 4, maximum: 8, status: "above_range" });
    expect(hamstrings).toMatchObject({ sets: 0, status: "below_target" });
  });

  it("uses customized weekly muscle target ranges", () => {
    const targets = {
      ...DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
      quads: { minimum: 0.5, maximum: 2 },
    };
    const analytics = buildDashboardAnalytics(
      [session("2026-05-24T10:00:00+08:00")],
      new Date("2026-05-25T10:00:00+08:00"),
      3,
      targets,
    );

    expect(analytics.muscleSetProgress.find(
      (item) => item.muscleGroup === "quads",
    )).toMatchObject({ minimum: 0.5, maximum: 2, sets: 1, status: "in_range" });
  });

  it("attaches record context, ignores incomplete sets, and resolves ties to the most recent workout", () => {
    const older = session("2026-05-10T10:00:00+08:00");
    const newer = session("2026-05-24T10:00:00+08:00");
    newer.session_exercises[0].session_sets.push({
      ...newer.session_exercises[0].session_sets[0],
      id: crypto.randomUUID(),
      weight_kg: 300,
      completed: false,
    });
    const analytics = buildDashboardAnalytics(
      [older, newer],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.personalRecords.heaviestCompletedSet).toMatchObject({
      value: 100,
      sessionId: newer.id,
      exerciseName: "Back Squat",
      reps: 5,
    });
    expect(analytics.personalRecords.highestEstimatedOneRepMax?.sessionId).toBe(
      newer.id,
    );
  });

  it("separates full workout volume from each exercise workout-volume record", () => {
    const workout = session("2026-05-24T10:00:00+08:00");
    const bench = {
      ...workout.session_exercises[0],
      id: crypto.randomUUID(),
      exercise_id: "bench-id",
      exercise: {
        ...exercise,
        id: "bench-id",
        name: "Bench Press",
        primary_muscle_group: "chest",
      },
      session_sets: [
        {
          ...workout.session_exercises[0].session_sets[0],
          id: crypto.randomUUID(),
          weight_kg: 50,
          reps: 10,
        },
      ],
    };
    workout.session_exercises.push(bench);
    const analytics = buildDashboardAnalytics(
      [workout],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.personalRecords.highestWorkoutVolume?.value).toBe(1000);
    expect(
      analytics.exerciseRecords.find((item) => item.exerciseName === "Bench Press")
        ?.highestWorkoutVolume.value,
    ).toBe(500);
    expect(
      analytics.exerciseRecords.find((item) => item.exerciseName === "Back Squat")
        ?.highestWorkoutVolume.value,
    ).toBe(500);
  });

  it("compares the live week against only the same elapsed period last week", () => {
    const analytics = buildDashboardAnalytics(
      [
        session("2026-05-24T10:00:00+08:00"),
        session("2026-05-17T10:00:00+08:00"),
        session("2026-05-19T10:00:00+08:00"),
      ],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.weeklyComparison.current).toEqual({
      workouts: 1,
      completedSets: 1,
      volume: 500,
    });
    expect(analytics.weeklyComparison.previousComparable).toEqual({
      workouts: 1,
      completedSets: 1,
      volume: 500,
    });
    expect(analytics.weeklyComparison.delta).toEqual({
      workouts: 0,
      completedSets: 0,
      volume: 0,
    });
  });

  it("returns twelve week buckets including zero weeks and the current in-progress week", () => {
    const analytics = buildDashboardAnalytics(
      [session("2026-05-24T10:00:00+08:00")],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.weeklyTrend).toHaveLength(12);
    expect(analytics.weeklyTrend.at(-1)).toMatchObject({
      isCurrent: true,
      workouts: 1,
      completedSets: 1,
      volume: 500,
    });
    expect(analytics.weeklyTrend.slice(0, -1).every((week) => week.workouts === 0)).toBe(
      true,
    );
  });

  it("provides contextual recovery flags from completed sets only", () => {
    const workout = session("2026-05-24T10:00:00+08:00");
    workout.session_exercises[0].session_sets = [
      {
        ...workout.session_exercises[0].session_sets[0],
        rpe: 9,
        note: "sharp pain",
      },
      {
        ...workout.session_exercises[0].session_sets[0],
        id: crypto.randomUUID(),
        rpe: 9.5,
      },
      {
        ...workout.session_exercises[0].session_sets[0],
        id: crypto.randomUUID(),
        completed: false,
        note: "injury",
      },
    ];
    const analytics = buildDashboardAnalytics(
      [workout],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.fatigueWatchList).toEqual([
      expect.objectContaining({
        type: "high_rpe",
        exerciseName: "Back Squat",
        sessionId: workout.id,
      }),
      expect.objectContaining({
        type: "pain",
        exerciseName: "Back Squat",
        sessionId: workout.id,
      }),
    ]);
  });

  it("returns nullable records and no exercise rows without completed sets", () => {
    const workout = session("2026-05-24T10:00:00+08:00");
    workout.session_exercises[0].session_sets[0].completed = false;
    const analytics = buildDashboardAnalytics(
      [workout],
      new Date("2026-05-25T10:00:00+08:00"),
    );

    expect(analytics.personalRecords).toEqual({
      heaviestCompletedSet: null,
      highestEstimatedOneRepMax: null,
      highestWorkoutVolume: null,
    });
    expect(analytics.exerciseRecords).toEqual([]);
  });

  it("counts consecutive weekly target streaks and skips an incomplete current week", () => {
    const workouts = [
      "2026-05-24T10:00:00+08:00",
      "2026-05-25T10:00:00+08:00",
      "2026-05-17T10:00:00+08:00",
      "2026-05-18T10:00:00+08:00",
      "2026-05-19T10:00:00+08:00",
      "2026-05-10T10:00:00+08:00",
      "2026-05-11T10:00:00+08:00",
      "2026-05-12T10:00:00+08:00",
      "2026-05-03T10:00:00+08:00",
      "2026-05-04T10:00:00+08:00",
      "2026-05-05T10:00:00+08:00",
    ].map(session);

    const analytics = buildDashboardAnalytics(
      workouts,
      new Date("2026-05-27T10:00:00+08:00"),
    );

    expect(analytics.weeklyTargetStreak).toBe(3);
  });

  it("includes the current week in the streak after hitting target", () => {
    const workouts = [
      "2026-05-24T10:00:00+08:00",
      "2026-05-25T10:00:00+08:00",
      "2026-05-26T10:00:00+08:00",
      "2026-05-17T10:00:00+08:00",
      "2026-05-18T10:00:00+08:00",
      "2026-05-19T10:00:00+08:00",
    ].map(session);

    const analytics = buildDashboardAnalytics(
      workouts,
      new Date("2026-05-27T10:00:00+08:00"),
    );

    expect(analytics.weeklyTargetStreak).toBe(2);
  });

  it("builds exercise detail history and useful top stats", () => {
    const older = session("2026-05-17T10:00:00+08:00");
    older.session_exercises[0].session_sets = [
      {
        ...older.session_exercises[0].session_sets[0],
        weight_kg: 90,
        reps: 8,
      },
      {
        ...older.session_exercises[0].session_sets[0],
        id: crypto.randomUUID(),
        set_number: 2,
        weight_kg: 90,
        reps: 8,
      },
    ];
    const newer = session("2026-05-24T10:00:00+08:00");
    newer.session_exercises[0].session_sets = [
      {
        ...newer.session_exercises[0].session_sets[0],
        weight_kg: 105,
        reps: 3,
      },
      {
        ...newer.session_exercises[0].session_sets[0],
        id: crypto.randomUUID(),
        set_number: 2,
        completed: false,
        weight_kg: 110,
        reps: 1,
      },
    ];

    const detail = buildExerciseDetailAnalytics([older, newer], exercise.id);

    expect(detail.history).toHaveLength(2);
    expect(detail.lastPerformedAt).toBe("2026-05-24T10:00:00+08:00");
    expect(detail.maxWeightSet).toMatchObject({ value: 105, reps: 3 });
    expect(detail.maxVolumeSession).toMatchObject({
      value: 1440,
      sessionId: older.id,
    });
    expect(detail.bestEstimatedOneRepMax).toMatchObject({
      value: 115.5,
      sessionId: newer.id,
    });
  });
});
