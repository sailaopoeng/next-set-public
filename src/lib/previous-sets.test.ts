import { describe, expect, it } from "vitest";

import type { SessionSet } from "@/lib/domain";
import {
  applyPreviousPerformance,
  copyPreviousSetValues,
  formatPreviousPerformanceSummary,
  formatPreviousSetLabel,
  pickLatestPreviousPerformance,
  previousSetForNumber,
} from "@/lib/previous-sets";

const olderSession = {
  id: "session-old",
  performed_at: "2026-08-01T09:00:00.000Z",
  session_exercises: [
    {
      exercise_id: "bench",
      session_sets: [
        {
          set_number: 1,
          weight_kg: 70,
          reps: 8,
          rpe: 8,
          completed: true,
        },
      ],
    },
  ],
};

const newerSession = {
  id: "session-new",
  performed_at: "2026-08-20T09:00:00.000Z",
  session_exercises: [
    {
      exercise_id: "bench",
      session_sets: [
        {
          set_number: 1,
          weight_kg: 80,
          reps: 8,
          rpe: 7.5,
          completed: true,
        },
        {
          set_number: 2,
          weight_kg: 80,
          reps: 7,
          rpe: 8,
          completed: true,
        },
        {
          set_number: 3,
          weight_kg: 82.5,
          reps: 5,
          rpe: null,
          completed: false,
        },
      ],
    },
    {
      exercise_id: "row",
      session_sets: [
        {
          set_number: 1,
          weight_kg: 22.5,
          reps: 10,
          rpe: 7,
          completed: true,
        },
      ],
    },
  ],
};

describe("previous set overlay", () => {
  it("picks the latest completed sets per exercise and ignores incomplete sets", () => {
    expect(
      pickLatestPreviousPerformance([olderSession, newerSession], [
        "bench",
        "row",
        "squat",
      ]),
    ).toEqual({
      bench: {
        exerciseId: "bench",
        sessionId: "session-new",
        performedAt: "2026-08-20T09:00:00.000Z",
        sets: [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 7.5 },
          { setNumber: 2, weightKg: 80, reps: 7, rpe: 8 },
        ],
      },
      row: {
        exerciseId: "row",
        sessionId: "session-new",
        performedAt: "2026-08-20T09:00:00.000Z",
        sets: [{ setNumber: 1, weightKg: 22.5, reps: 10, rpe: 7 }],
      },
    });
  });

  it("formats last-session labels compactly", () => {
    expect(
      formatPreviousSetLabel({ setNumber: 1, weightKg: 80, reps: 8, rpe: 7.5 }),
    ).toBe("80×8 @7.5");
    expect(
      formatPreviousPerformanceSummary({
        exerciseId: "bench",
        sessionId: "session-new",
        performedAt: "2026-08-20T09:00:00.000Z",
        sets: [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 7.5 },
          { setNumber: 2, weightKg: 80, reps: 7, rpe: 8 },
        ],
      }),
    ).toBe("80×8 @7.5 · 80×7 @8");
  });

  it("copies one previous set into an incomplete current set and leaves completed sets alone", () => {
    const incomplete: SessionSet = {
      id: "s1",
      session_exercise_id: "ex1",
      set_number: 1,
      weight_kg: 0,
      reps: 0,
      rpe: null,
      completed: false,
      note: null,
    };
    const completed: SessionSet = { ...incomplete, completed: true, weight_kg: 60 };

    expect(
      copyPreviousSetValues(incomplete, {
        setNumber: 1,
        weightKg: 80,
        reps: 8,
        rpe: 7.5,
      }),
    ).toEqual({ ...incomplete, weight_kg: 80, reps: 8 });
    expect(
      copyPreviousSetValues(completed, {
        setNumber: 1,
        weightKg: 80,
        reps: 8,
        rpe: 7.5,
      }),
    ).toEqual(completed);
  });

  it("fills incomplete sets from last time and appends extra previous sets", () => {
    const current: SessionSet[] = [
      {
        id: "s1",
        session_exercise_id: "ex1",
        set_number: 1,
        weight_kg: 70,
        reps: 8,
        rpe: 8,
        completed: true,
        note: null,
      },
      {
        id: "s2",
        session_exercise_id: "ex1",
        set_number: 2,
        weight_kg: 0,
        reps: 0,
        rpe: null,
        completed: false,
        note: null,
      },
    ];

    expect(
      applyPreviousPerformance(
        current,
        [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 7.5 },
          { setNumber: 2, weightKg: 80, reps: 7, rpe: 8 },
          { setNumber: 3, weightKg: 82.5, reps: 6, rpe: 8.5 },
        ],
        "ex1",
        () => "s3",
      ),
    ).toEqual([
      current[0],
      { ...current[1], weight_kg: 80, reps: 7 },
      {
        id: "s3",
        session_exercise_id: "ex1",
        set_number: 3,
        weight_kg: 82.5,
        reps: 6,
        rpe: null,
        completed: false,
        note: null,
      },
    ]);
  });

  it("finds the matching previous set by number", () => {
    const previous = pickLatestPreviousPerformance([newerSession], ["bench"]).bench;
    expect(previousSetForNumber(previous, 2)?.reps).toBe(7);
    expect(previousSetForNumber(previous, 9)).toBeNull();
  });
});
