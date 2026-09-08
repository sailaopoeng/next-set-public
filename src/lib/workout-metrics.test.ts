import { describe, expect, it } from "vitest";

import type { SessionWithDetails } from "@/lib/domain";
import { sessionVolume } from "@/lib/workout-metrics";

describe("workout metrics", () => {
  it("applies each exercise multiplier to the live session volume", () => {
    const session = {
      session_exercises: [
        {
          exercise: { volume_multiplier: 2 },
          session_sets: [
            { completed: true, weight_kg: 15, reps: 10 },
            { completed: false, weight_kg: 15, reps: 10 },
          ],
        },
        {
          exercise: { volume_multiplier: 1 },
          session_sets: [{ completed: true, weight_kg: 20, reps: 5 }],
        },
      ],
    } as SessionWithDetails;

    expect(sessionVolume(session)).toBe(400);
  });
});
