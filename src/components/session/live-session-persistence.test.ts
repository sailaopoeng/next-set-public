import { describe, expect, it } from "vitest";

import {
  buildLiveSessionSyncPayload,
  createLiveSessionBackup,
  parseLiveSessionBackup,
} from "@/components/session/live-session-persistence";
import type { SessionWithDetails } from "@/lib/domain";

const session: SessionWithDetails = {
  id: "11111111-1111-4111-8111-111111111111",
  template_id: null,
  source_suggestion_id: null,
  name: "Workout",
  status: "active",
  performed_at: "2026-08-29T09:00:00.000Z",
  started_at: "2026-08-29T09:00:00.000Z",
  finished_at: null,
  notes: null,
  session_exercises: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      session_id: "11111111-1111-4111-8111-111111111111",
      exercise_id: "33333333-3333-4333-8333-333333333333",
      exercise_order: 1,
      planned_sets: 1,
      target_reps_min: 8,
      target_reps_max: 12,
      target_weight_kg: 20,
      rest_seconds: 90,
      superset_group_id: null,
      notes: null,
      exercise: {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Row",
        primary_muscle_group: "back",
        secondary_muscle_groups: [],
        equipment: "dumbbell",
        lift_category: "dumbbell_upper",
        default_increment_kg: 1,
        is_main_lift: false,
        is_ai_suggestion_enabled: true,
        volume_multiplier: 1,
        notes: null,
      },
      session_sets: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          session_exercise_id: "22222222-2222-4222-8222-222222222222",
          set_number: 1,
          weight_kg: 22.5,
          reps: 10,
          rpe: 7.5,
          completed: true,
          note: "clean",
        },
      ],
    },
  ],
};

describe("live session persistence", () => {
  it("builds one complete atomic snapshot from the responsive UI draft", () => {
    expect(
      buildLiveSessionSyncPayload(session, "2026-08-29T17:00", "Good session"),
    ).toEqual({
      performedAt: new Date("2026-08-29T17:00").toISOString(),
      notes: "Good session",
      exercises: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          exerciseId: "33333333-3333-4333-8333-333333333333",
          exerciseOrder: 1,
          targetRepsMin: 8,
          targetRepsMax: 12,
          targetWeightKg: 20,
          restSeconds: 90,
          supersetGroupId: null,
          notes: null,
          sets: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              setNumber: 1,
              weightKg: 22.5,
              reps: 10,
              rpe: 7.5,
              completed: true,
              note: "clean",
            },
          ],
        },
      ],
    });
  });

  it("round-trips a recoverable local backup", () => {
    const backup = createLiveSessionBackup(
      session,
      "2026-08-29T17:00",
      "Good session",
      7,
    );

    expect(parseLiveSessionBackup(JSON.stringify(backup), session.id)).toEqual(
      backup,
    );
  });

  it("rejects corrupt backups and backups for another workout", () => {
    const backup = createLiveSessionBackup(session, "2026-08-29T17:00", "", 1);

    expect(parseLiveSessionBackup("not-json", session.id)).toBeNull();
    expect(
      parseLiveSessionBackup(
        JSON.stringify(backup),
        "55555555-5555-4555-8555-555555555555",
      ),
    ).toBeNull();
  });
});
