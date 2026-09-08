import { describe, expect, it } from "vitest";

import type { Exercise, SessionWithDetails } from "@/lib/domain";
import { DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS } from "@/lib/weekly-targets";
import { buildWeeklyFacts } from "@/server/ai/weekly-analysis";

const exercise: Exercise = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Back Squat",
  primary_muscle_group: "quads",
  secondary_muscle_groups: [],
  equipment: "barbell",
  lift_category: "lower_compound",
  default_increment_kg: 5,
  is_main_lift: true,
  is_ai_suggestion_enabled: true,
  volume_multiplier: 1,
  notes: null,
};

function session(date: string, note: string | null = null): SessionWithDetails {
  const id = crypto.randomUUID();
  return {
    id,
    template_id: null,
    source_suggestion_id: null,
    name: "Workout A",
    status: "completed",
    performed_at: date,
    started_at: date,
    finished_at: date,
    notes: null,
    session_exercises: [{
      id: crypto.randomUUID(),
      session_id: id,
      exercise_id: exercise.id,
      exercise_order: 1,
      planned_sets: 3,
      target_reps_min: 5,
      target_reps_max: 8,
      target_weight_kg: 100,
      rest_seconds: 180,
      notes: null,
      exercise,
      session_sets: [{
        id: crypto.randomUUID(),
        session_exercise_id: id,
        set_number: 1,
        weight_kg: 100,
        reps: 4,
        rpe: 9,
        completed: true,
        note,
      }],
    }],
  };
}

describe("weekly AI analysis facts", () => {
  it("requires balanced multi-session fatigue evidence for a deload recommendation", () => {
    const facts = buildWeeklyFacts(
      [
        session("2026-06-28T10:00:00+08:00", "Knee pain"),
        session("2026-07-01T10:00:00+08:00"),
      ],
      [],
      3,
      DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
    );

    expect(facts.deloadRecommended).toBe(true);
    expect(facts.deloadReasons).toEqual(expect.arrayContaining([
      expect.stringContaining("Pain was recorded"),
      expect.stringContaining("missed across 2 sessions"),
    ]));
  });

  it("does not recommend a deload from one difficult session", () => {
    const facts = buildWeeklyFacts(
      [session("2026-06-28T10:00:00+08:00")],
      [],
      3,
      DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
    );

    expect(facts.deloadRecommended).toBe(false);
  });

  it("builds half-set and ten-percent-lighter advice for a confirmed deload", () => {
    const facts = buildWeeklyFacts(
      [session("2026-06-28T10:00:00+08:00")],
      [],
      3,
      DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
      false,
      true,
    );

    expect(facts.actions[0]?.text).toContain("2 working sets at 90kg");
  });
});
