export const WEEKLY_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "quads",
  "hamstrings",
  "biceps",
  "triceps",
] as const;

export type WeeklyMuscleGroup = (typeof WEEKLY_MUSCLE_GROUPS)[number];

export type WeeklyMuscleTarget = {
  muscleGroup: WeeklyMuscleGroup;
  minimum: number;
  maximum: number;
  directOnly: boolean;
};

export type WeeklyMuscleTargetSettings = Record<
  WeeklyMuscleGroup,
  { minimum: number; maximum: number }
>;

export const DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS: WeeklyMuscleTargetSettings = {
  chest: { minimum: 8, maximum: 12 },
  back: { minimum: 10, maximum: 14 },
  shoulders: { minimum: 8, maximum: 12 },
  quads: { minimum: 8, maximum: 12 },
  hamstrings: { minimum: 6, maximum: 10 },
  biceps: { minimum: 4, maximum: 8 },
  triceps: { minimum: 4, maximum: 8 },
};

export function normalizeWeeklyMuscleTargetSettings(
  value: unknown,
): WeeklyMuscleTargetSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return Object.fromEntries(
    WEEKLY_MUSCLE_GROUPS.map((muscleGroup) => {
      const fallback = DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS[muscleGroup];
      const candidate = source[muscleGroup];
      const range = candidate && typeof candidate === "object"
        ? candidate as Record<string, unknown>
        : {};
      const minimum = validTargetNumber(range.minimum) ? range.minimum : fallback.minimum;
      const maximum = validTargetNumber(range.maximum) && range.maximum >= minimum
        ? range.maximum
        : Math.max(minimum, fallback.maximum);
      return [muscleGroup, { minimum, maximum }];
    }),
  ) as WeeklyMuscleTargetSettings;
}

export function toWeeklyMuscleTargets(
  settings: WeeklyMuscleTargetSettings,
): WeeklyMuscleTarget[] {
  return WEEKLY_MUSCLE_GROUPS.map((muscleGroup) => ({
    muscleGroup,
    ...settings[muscleGroup],
    directOnly: muscleGroup === "biceps" || muscleGroup === "triceps",
  }));
}

function validTargetNumber(value: unknown): value is number {
  return typeof value === "number" && value >= 0.5 && value <= 50 && value * 2 % 1 === 0;
}
