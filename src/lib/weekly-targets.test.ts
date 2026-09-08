import { describe, expect, it } from "vitest";

import { weeklyMuscleTargetsUpdateSchema } from "@/lib/validation/schemas";
import {
  DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
  normalizeWeeklyMuscleTargetSettings,
} from "@/lib/weekly-targets";

describe("weekly muscle targets", () => {
  it("accepts half-set ranges and rejects reversed ranges", () => {
    expect(weeklyMuscleTargetsUpdateSchema.safeParse({
      ...DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
      chest: { minimum: 7.5, maximum: 11.5 },
    }).success).toBe(true);
    expect(weeklyMuscleTargetsUpdateSchema.safeParse({
      ...DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
      chest: { minimum: 12, maximum: 8 },
    }).success).toBe(false);
  });

  it("normalizes malformed stored values without producing an inverted range", () => {
    const targets = normalizeWeeklyMuscleTargetSettings({
      chest: { minimum: 20, maximum: 10 },
    });

    expect(targets.chest).toEqual({ minimum: 20, maximum: 20 });
    expect(targets.back).toEqual(DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS.back);
  });
});
