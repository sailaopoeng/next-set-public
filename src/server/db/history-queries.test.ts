import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listAnalyticsSessions,
  listLatestCompletedSetsByExerciseIds,
} from "@/server/db/queries";

describe("history queries", () => {
  it("keeps searching an exercise beyond the first page with no completed sets", async () => {
    const ranges: Array<[number, number]> = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn((start: number, end: number) => {
        ranges.push([start, end]);
        if (start === 0) {
          return Promise.resolve({ data: Array.from({ length: 20 }, (_, index) => ({
            id: `empty-${index}`,
            performed_at: `2026-09-${String(20 - index).padStart(2, "0")}T00:00:00Z`,
            session_exercises: [{ exercise_id: "bench", session_sets: [] }],
          })), error: null });
        }
        return Promise.resolve({ data: [{
          id: "older",
          performed_at: "2026-08-01T00:00:00Z",
          session_exercises: [{ exercise_id: "bench", session_sets: [{
            set_number: 1, weight_kg: 60, reps: 8, rpe: 8, completed: true,
          }] }],
        }], error: null });
      }),
    };
    const supabase = { from: vi.fn(() => query) } as unknown as SupabaseClient;

    const previous = await listLatestCompletedSetsByExerciseIds(
      supabase, "user-1", ["bench"], "current",
    );

    expect(ranges).toEqual([[0, 19], [20, 39]]);
    expect(query.eq).toHaveBeenCalledWith("session_exercises.exercise_id", "bench");
    expect(previous.bench?.sessionId).toBe("older");
  });

  it("uses compact completed-set rows for analytics", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn(() => query) } as unknown as SupabaseClient;

    expect(await listAnalyticsSessions(supabase, "user-1")).toEqual([]);
    expect(query.select.mock.calls[0][0]).not.toContain("session_sets(*)");
    expect(query.eq).toHaveBeenCalledWith("session_exercises.session_sets.completed", true);
  });
});
