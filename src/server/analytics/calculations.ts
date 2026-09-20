import type { Exercise, SessionSet, SessionWithDetails, WorkoutSession } from "@/lib/domain";
import { canonicalMuscleGroup } from "@/lib/muscle-groups";
import { exerciseMentionsPain, textMentionsPain } from "@/lib/pain";
import { sessionSetVolume } from "@/lib/workout-metrics";
import {
  DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
  toWeeklyMuscleTargets,
  type WeeklyMuscleTarget,
} from "@/lib/weekly-targets";
import { epleyEstimatedOneRepMax } from "@/server/progression/rules";

const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const WEEKLY_MUSCLE_TARGETS = toWeeklyMuscleTargets(
  DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
);

export type AnalyticsSession = Pick<
  WorkoutSession,
  "id" | "name" | "status" | "performed_at" | "notes"
> & {
  session_exercises: Array<{
    exercise_id: string;
    notes: string | null;
    exercise: Pick<
      Exercise,
      "id" | "name" | "primary_muscle_group" | "secondary_muscle_groups" | "is_main_lift" | "volume_multiplier"
    >;
    session_sets: Array<Pick<SessionSet, "weight_kg" | "reps" | "rpe" | "completed" | "note">>;
  }>;
};

type SessionExerciseWithSets = AnalyticsSession["session_exercises"][number];

type CompletedSetRow = {
  session: AnalyticsSession;
  exercise: SessionExerciseWithSets;
  set: Pick<SessionSet, "weight_kg" | "reps" | "rpe" | "completed" | "note">;
};

export type AnalyticsRange = {
  weekStart: Date;
  weekEnd: Date;
};

export type MuscleSetProgress = {
  muscleGroup: string;
  sets: number;
  previousSets: number;
  minimum: number;
  maximum: number;
  status: "below_target" | "in_range" | "above_range";
};

export type SetAchievement = {
  value: number;
  weightKg: number;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  sessionId: string;
  sessionName: string;
  performedAt: string;
};

export type VolumeAchievement = {
  value: number;
  sessionId: string;
  sessionName: string;
  performedAt: string;
};

export type ExerciseVolumeAchievement = VolumeAchievement & {
  exerciseId: string;
  exerciseName: string;
};

export type ExerciseRecords = {
  exerciseId: string;
  exerciseName: string;
  isMainLift: boolean;
  heaviestCompletedSet: SetAchievement;
  highestEstimatedOneRepMax: SetAchievement | null;
  highestWorkoutVolume: ExerciseVolumeAchievement;
};

export type ExerciseSessionHistory = {
  sessionId: string;
  sessionName: string;
  performedAt: string;
  sets: SessionSet[];
};

export type ExerciseDetailAnalytics = {
  history: ExerciseSessionHistory[];
  strengthPoints: Array<{
    date: string;
    estimatedOneRepMax: number;
    maxWeight: number;
    sessionId: string;
  }>;
  lastPerformedAt: string | null;
  maxWeightSet: SetAchievement | null;
  maxVolumeSession: ExerciseVolumeAchievement | null;
  bestEstimatedOneRepMax: SetAchievement | null;
};

export type WeeklyTotals = {
  workouts: number;
  completedSets: number;
  volume: number;
};

export type WeeklyTrendBucket = WeeklyTotals & {
  weekStart: string;
  isCurrent: boolean;
};

export type StrengthTrendSeries = {
  exerciseId: string;
  exerciseName: string;
  isMainLift: boolean;
  lastPerformedAt: string;
  points: Array<{
    date: string;
    estimatedOneRepMax: number;
    maxWeight: number;
    sessionId: string;
  }>;
};

export type FatigueEvent = {
  type: "high_rpe" | "pain";
  exerciseName: string;
  reason: string;
  sessionId: string;
  sessionName: string;
  performedAt: string;
};

export type DashboardAnalytics = {
  weeklyWorkoutCount: number;
  totalSets: number;
  totalVolume: number;
  volumeByMuscleGroup: Array<{ muscleGroup: string; volume: number }>;
  personalRecords: {
    heaviestCompletedSet: SetAchievement | null;
    highestEstimatedOneRepMax: SetAchievement | null;
    highestWorkoutVolume: VolumeAchievement | null;
  };
  exerciseRecords: ExerciseRecords[];
  strengthTrends: StrengthTrendSeries[];
  defaultStrengthExerciseId: string | null;
  weeklyComparison: {
    current: WeeklyTotals;
    previousComparable: WeeklyTotals;
    delta: WeeklyTotals;
  };
  weeklyTrend: WeeklyTrendBucket[];
  fatigueWatchList: FatigueEvent[];
  weeksMeetingTarget: number;
  weeklyTargetStreak: number;
  muscleSetProgress: MuscleSetProgress[];
};

export function getSundayWeekRangeSingapore(now = new Date()): AnalyticsRange {
  const singaporeNow = new Date(now.getTime() + SINGAPORE_OFFSET_MS);
  const day = singaporeNow.getUTCDay();
  const startLocal = Date.UTC(
    singaporeNow.getUTCFullYear(),
    singaporeNow.getUTCMonth(),
    singaporeNow.getUTCDate() - day,
    0,
    0,
    0,
    0,
  );
  const weekStart = new Date(startLocal - SINGAPORE_OFFSET_MS);
  const weekEnd = new Date(weekStart.getTime() + WEEK_MS);

  return { weekStart, weekEnd };
}

export function formatSingaporeDateKey(date: Date) {
  return new Date(date.getTime() + SINGAPORE_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function getSingaporeWeekRangeFromKey(weekStart: string): AnalyticsRange {
  const start = new Date(`${weekStart}T00:00:00+08:00`);
  return {
    weekStart: start,
    weekEnd: new Date(start.getTime() + WEEK_MS),
  };
}

export function buildDashboardAnalytics(
  sessions: AnalyticsSession[],
  now = new Date(),
  weeklyTarget = 3,
  muscleTargetSettings = DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
): DashboardAnalytics {
  const { weekStart, weekEnd } = getSundayWeekRangeSingapore(now);
  const completed = sessions
    .filter((session) => session.status === "completed" && session.performed_at)
    .sort((a, b) => time(b.performed_at) - time(a.performed_at));
  const currentWeekEnd = now < weekEnd ? now : weekEnd;
  const previousWeekStart = new Date(weekStart.getTime() - WEEK_MS);
  const previousComparableEnd = new Date(currentWeekEnd.getTime() - WEEK_MS);
  const currentWeek = sessionsInRange(completed, weekStart, currentWeekEnd);
  const previousComparable = sessionsInRange(
    completed,
    previousWeekStart,
    previousComparableEnd,
  );
  const currentRows = completedSetRows(currentWeek);
  const previousRows = completedSetRows(previousComparable);
  const allRows = completedSetRows(completed);
  const currentTotals = buildWeeklyTotals(currentWeek, currentRows);
  const previousTotals = buildWeeklyTotals(previousComparable, previousRows);
  const strengthTrends = buildStrengthTrends(allRows);
  const personalRecords = buildPersonalRecords(completed, allRows);

  return {
    weeklyWorkoutCount: currentTotals.workouts,
    totalSets: currentTotals.completedSets,
    totalVolume: currentTotals.volume,
    volumeByMuscleGroup: groupVolumeByMuscle(currentRows),
    personalRecords,
    exerciseRecords: buildExerciseRecords(allRows),
    strengthTrends,
    defaultStrengthExerciseId:
      strengthTrends.find((trend) => trend.isMainLift)?.exerciseId ??
      strengthTrends[0]?.exerciseId ??
      null,
    weeklyComparison: {
      current: currentTotals,
      previousComparable: previousTotals,
      delta: {
        workouts: currentTotals.workouts - previousTotals.workouts,
        completedSets: currentTotals.completedSets - previousTotals.completedSets,
        volume: roundToHalf(currentTotals.volume - previousTotals.volume),
      },
    },
    weeklyTrend: buildWeeklyTrend(completed, weekStart, currentWeekEnd),
    fatigueWatchList: buildFatigueWatchList(completed),
    weeksMeetingTarget: countWeeksMeetingTarget(completed, weeklyTarget),
    weeklyTargetStreak: countWeeklyTargetStreak(
      completed,
      weekStart,
      weeklyTarget,
    ),
    muscleSetProgress: buildMuscleSetProgress(
      currentRows,
      previousRows,
      toWeeklyMuscleTargets(muscleTargetSettings),
    ),
  };
}

export function buildWeeklyMuscleSetProgress(
  sessions: SessionWithDetails[],
  muscleTargetSettings = DEFAULT_WEEKLY_MUSCLE_TARGET_SETTINGS,
): MuscleSetProgress[] {
  return buildMuscleSetProgress(
    completedSetRows(sessions),
    [],
    toWeeklyMuscleTargets(muscleTargetSettings),
  );
}

export function buildExerciseDetailAnalytics(
  sessions: SessionWithDetails[],
  exerciseId: string,
): ExerciseDetailAnalytics {
  const completed = sessions
    .filter((session) => session.status === "completed")
    .sort((a, b) => time(b.performed_at) - time(a.performed_at));
  const matchingExercises = completed.flatMap((session) =>
    session.session_exercises
      .filter((exercise) => exercise.exercise_id === exerciseId)
      .map((exercise) => ({ session, exercise })),
  );
  const history = matchingExercises.map(({ session, exercise }) => ({
    sessionId: session.id,
    sessionName: session.name,
    performedAt: session.performed_at,
    sets: exercise.session_sets,
  }));
  const rows = matchingExercises.flatMap(({ session, exercise }) =>
    exercise.session_sets
      .filter((set) => set.completed)
      .map((set) => ({ session, exercise, set })),
  );
  const strengthPoints = matchingExercises.flatMap(({ session, exercise }) => {
    const completedSets = exercise.session_sets.filter((set) => set.completed);
    if (completedSets.length === 0) return [];
    const estimatedOneRepMax = Math.max(...completedSets.map((set) =>
      epleyEstimatedOneRepMax(set.weight_kg, set.reps),
    ));
    if (estimatedOneRepMax <= 0) return [];
    return [{
      date: session.performed_at,
      estimatedOneRepMax,
      maxWeight: Math.max(...completedSets.map((set) => set.weight_kg)),
      sessionId: session.id,
    }];
  }).sort((a, b) => time(a.date) - time(b.date));

  return {
    history,
    strengthPoints,
    lastPerformedAt: history[0]?.performedAt ?? null,
    maxWeightSet: chooseRecord(
      rows.map((row) => makeSetAchievement(row, row.set.weight_kg)),
    ),
    maxVolumeSession: buildExerciseMaxVolume(rows),
    bestEstimatedOneRepMax: chooseRecord(
      rows
        .map((row) =>
          makeSetAchievement(
            row,
            epleyEstimatedOneRepMax(row.set.weight_kg, row.set.reps),
          ),
        )
        .filter((record) => record.value > 0),
    ),
  };
}

function buildPersonalRecords(
  sessions: AnalyticsSession[],
  rows: CompletedSetRow[],
): DashboardAnalytics["personalRecords"] {
  return {
    heaviestCompletedSet: chooseRecord(
      rows.map((row) => makeSetAchievement(row, row.set.weight_kg)),
    ),
    highestEstimatedOneRepMax: chooseRecord(
      rows
        .map((row) =>
          makeSetAchievement(
            row,
            epleyEstimatedOneRepMax(row.set.weight_kg, row.set.reps),
          ),
        )
        .filter((record) => record.value > 0),
    ),
    highestWorkoutVolume: chooseRecord(
      sessions.flatMap((session) => {
        const sessionRows = rows.filter((row) => row.session.id === session.id);
        return sessionRows.length > 0
          ? [
              {
                value: sum(
                  sessionRows.map(({ exercise, set }) =>
                    sessionSetVolume(set, exercise.exercise.volume_multiplier),
                  ),
                ),
                sessionId: session.id,
                sessionName: session.name,
                performedAt: session.performed_at,
              },
            ]
          : [];
      }),
    ),
  };
}

function buildExerciseMaxVolume(
  rows: CompletedSetRow[],
): ExerciseVolumeAchievement | null {
  const exerciseVolumes = new Map<string, ExerciseVolumeAchievement>();

  for (const row of rows) {
    const source = row.exercise.exercise;
    const existing = exerciseVolumes.get(row.session.id);
    const volume = sessionSetVolume(
      row.set,
      row.exercise.exercise.volume_multiplier,
    );
    exerciseVolumes.set(row.session.id, {
      value: roundToHalf((existing?.value ?? 0) + volume),
      exerciseId: source.id,
      exerciseName: source.name,
      sessionId: row.session.id,
      sessionName: row.session.name,
      performedAt: row.session.performed_at,
    });
  }

  return chooseRecord([...exerciseVolumes.values()]);
}

function buildExerciseRecords(rows: CompletedSetRow[]): ExerciseRecords[] {
  const rowsByExercise = groupRowsByExercise(rows);

  return [...rowsByExercise.values()]
    .map((exerciseRows) => {
      const source = exerciseRows[0].exercise.exercise;

      return {
        exerciseId: source.id,
        exerciseName: source.name,
        isMainLift: source.is_main_lift,
        heaviestCompletedSet: chooseRecord(
          exerciseRows.map((row) => makeSetAchievement(row, row.set.weight_kg)),
        )!,
        highestEstimatedOneRepMax: chooseRecord(
          exerciseRows
            .map((row) =>
              makeSetAchievement(
                row,
                epleyEstimatedOneRepMax(row.set.weight_kg, row.set.reps),
              ),
            )
            .filter((record) => record.value > 0),
        ),
        highestWorkoutVolume: buildExerciseMaxVolume(exerciseRows)!,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isMainLift) - Number(a.isMainLift) ||
        a.exerciseName.localeCompare(b.exerciseName),
    );
}

function buildStrengthTrends(rows: CompletedSetRow[]): StrengthTrendSeries[] {
  const rowsByExercise = groupRowsByExercise(rows);

  return [...rowsByExercise.values()]
    .flatMap((exerciseRows) => {
      const source = exerciseRows[0].exercise.exercise;
      const sessions = new Map<string, CompletedSetRow[]>();

      for (const row of exerciseRows) {
        const existing = sessions.get(row.session.id) ?? [];
        existing.push(row);
        sessions.set(row.session.id, existing);
      }

      const points = [...sessions.values()]
        .map((sessionRows) => ({
          date: sessionRows[0].session.performed_at,
          estimatedOneRepMax: Math.max(
            ...sessionRows.map(({ set }) =>
              epleyEstimatedOneRepMax(set.weight_kg, set.reps),
            ),
          ),
          maxWeight: Math.max(...sessionRows.map(({ set }) => set.weight_kg)),
          sessionId: sessionRows[0].session.id,
        }))
        .filter((point) => point.estimatedOneRepMax > 0)
        .sort((a, b) => time(a.date) - time(b.date));

      return points.length > 0
        ? [
            {
              exerciseId: source.id,
              exerciseName: source.name,
              isMainLift: source.is_main_lift,
              lastPerformedAt: points.at(-1)!.date,
              points,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        time(b.lastPerformedAt) - time(a.lastPerformedAt) ||
        a.exerciseName.localeCompare(b.exerciseName),
    );
}

function buildWeeklyTrend(
  sessions: AnalyticsSession[],
  currentWeekStart: Date,
  currentWeekEnd: Date,
): WeeklyTrendBucket[] {
  return Array.from({ length: 12 }, (_, index) => {
    const weekStart = new Date(
      currentWeekStart.getTime() - (11 - index) * WEEK_MS,
    );
    const isCurrent = index === 11;
    const end = isCurrent
      ? currentWeekEnd
      : new Date(weekStart.getTime() + WEEK_MS);
    const bucketSessions = sessionsInRange(sessions, weekStart, end);
    const totals = buildWeeklyTotals(
      bucketSessions,
      completedSetRows(bucketSessions),
    );

    return {
      weekStart: weekStart.toISOString(),
      isCurrent,
      ...totals,
    };
  });
}

function buildWeeklyTotals(
  sessions: AnalyticsSession[],
  rows: CompletedSetRow[],
): WeeklyTotals {
  return {
    workouts: sessions.length,
    completedSets: rows.length,
    volume: sum(
      rows.map(({ exercise, set }) =>
        sessionSetVolume(set, exercise.exercise.volume_multiplier),
      ),
    ),
  };
}

function buildMuscleSetProgress(
  rows: CompletedSetRow[],
  previousRows: CompletedSetRow[],
  targets: WeeklyMuscleTarget[],
): MuscleSetProgress[] {
  return targets.map((target) => {
    const sets = muscleSetCount(rows, target);
    const previousSets = muscleSetCount(previousRows, target);

    return {
      muscleGroup: target.muscleGroup,
      sets,
      previousSets,
      minimum: target.minimum,
      maximum: target.maximum,
      status:
        sets < target.minimum
          ? "below_target"
          : sets > target.maximum
            ? "above_range"
            : "in_range",
    };
  });
}

function muscleSetCount(
  rows: CompletedSetRow[],
  target: WeeklyMuscleTarget,
) {
  return roundToHalf(
    rows.reduce((total, { exercise }) => {
      const primary = canonicalMuscleGroup(exercise.exercise.primary_muscle_group);
      const secondary = exercise.exercise.secondary_muscle_groups.map(
        canonicalMuscleGroup,
      );

      if (primary === target.muscleGroup) return total + 1;
      if (!target.directOnly && secondary.includes(target.muscleGroup)) {
        return total + 0.5;
      }
      return total;
    }, 0),
  );
}

function groupVolumeByMuscle(rows: CompletedSetRow[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const muscle = row.exercise.exercise.primary_muscle_group;
    map.set(
      muscle,
      (map.get(muscle) ?? 0) +
        sessionSetVolume(row.set, row.exercise.exercise.volume_multiplier),
    );
  }

  return [...map.entries()]
    .map(([muscleGroup, volume]) => ({ muscleGroup, volume }))
    .sort((a, b) => b.volume - a.volume);
}

function buildFatigueWatchList(sessions: AnalyticsSession[]): FatigueEvent[] {
  const events: FatigueEvent[] = [];

  for (const session of sessions.slice(0, 10)) {
    const sessionPain = textMentionsPain(session.notes);
    for (const exercise of session.session_exercises) {
      const completedSets = exercise.session_sets.filter((set) => set.completed);
      const highRpeSets = completedSets.filter((set) => (set.rpe ?? 0) >= 9);
      const painNoted = completedSets.length > 0 &&
        (sessionPain || exerciseMentionsPain({
          ...exercise,
          session_sets: completedSets,
        }));

      if (highRpeSets.length >= 2) {
        events.push({
          type: "high_rpe",
          exerciseName: exercise.exercise.name,
          reason: "Repeated high RPE",
          sessionId: session.id,
          sessionName: session.name,
          performedAt: session.performed_at,
        });
      }

      if (painNoted) {
        events.push({
          type: "pain",
          exerciseName: exercise.exercise.name,
          reason: "Pain noted",
          sessionId: session.id,
          sessionName: session.name,
          performedAt: session.performed_at,
        });
      }
    }
  }

  return events;
}

function countWeeksMeetingTarget(
  sessions: AnalyticsSession[],
  weeklyTarget: number,
) {
  const weeks = new Map<number, number>();

  for (const session of sessions) {
    const performedAt = new Date(session.performed_at);
    const weekStart = getSundayWeekRangeSingapore(performedAt).weekStart.getTime();
    weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + 1);
  }

  return [...weeks.values()].filter((count) => count >= weeklyTarget).length;
}

function countWeeklyTargetStreak(
  sessions: AnalyticsSession[],
  currentWeekStart: Date,
  weeklyTarget: number,
) {
  const weeks = new Map<number, number>();

  for (const session of sessions) {
    const performedAt = new Date(session.performed_at);
    const weekStart = getSundayWeekRangeSingapore(performedAt).weekStart.getTime();
    weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + 1);
  }

  let cursor =
    (weeks.get(currentWeekStart.getTime()) ?? 0) >= weeklyTarget
      ? currentWeekStart.getTime()
      : currentWeekStart.getTime() - WEEK_MS;
  let streak = 0;

  while ((weeks.get(cursor) ?? 0) >= weeklyTarget) {
    streak += 1;
    cursor -= WEEK_MS;
  }

  return streak;
}

function completedSetRows(sessions: AnalyticsSession[]) {
  return sessions.flatMap((session) =>
    session.session_exercises.flatMap((exercise) =>
      exercise.session_sets
        .filter((set) => set.completed)
        .map((set) => ({ session, exercise, set })),
    ),
  );
}

function groupRowsByExercise(rows: CompletedSetRow[]) {
  const grouped = new Map<string, CompletedSetRow[]>();

  for (const row of rows) {
    const existing = grouped.get(row.exercise.exercise.id) ?? [];
    existing.push(row);
    grouped.set(row.exercise.exercise.id, existing);
  }

  return grouped;
}

function sessionsInRange(
  sessions: AnalyticsSession[],
  start: Date,
  end: Date,
) {
  return sessions.filter((session) => {
    const performedAt = new Date(session.performed_at);
    return performedAt >= start && performedAt < end;
  });
}

function makeSetAchievement(row: CompletedSetRow, value: number): SetAchievement {
  return {
    value,
    weightKg: row.set.weight_kg,
    exerciseId: row.exercise.exercise.id,
    exerciseName: row.exercise.exercise.name,
    reps: row.set.reps,
    sessionId: row.session.id,
    sessionName: row.session.name,
    performedAt: row.session.performed_at,
  };
}

function chooseRecord<T extends { value: number; performedAt: string }>(
  records: T[],
): T | null {
  return records.reduce<T | null>((best, record) => {
    if (!best || record.value > best.value) return record;
    if (record.value === best.value && time(record.performedAt) > time(best.performedAt)) {
      return record;
    }
    return best;
  }, null);
}

function time(value: string) {
  return new Date(value).getTime();
}

function sum(values: number[]) {
  return roundToHalf(values.reduce((total, value) => total + value, 0));
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}
