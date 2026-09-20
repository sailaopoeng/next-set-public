import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  SessionWithDetails,
  WeeklyAnalysis,
  WeeklyAnalysisAction,
} from "@/lib/domain";
import type { WeeklyMuscleTargetSettings } from "@/lib/weekly-targets";
import { sessionSetVolume } from "@/lib/workout-metrics";
import { sessionMentionsPain } from "@/lib/pain";
import {
  buildWeeklyMuscleSetProgress,
  formatSingaporeDateKey,
  getSingaporeWeekRangeFromKey,
  getSundayWeekRangeSingapore,
} from "@/server/analytics/calculations";
import {
  getProfilePreferences,
  listCompletedSessionDetailsInRange,
  listDeloadWeeks,
  saveWeeklyAnalysis,
} from "@/server/db/queries";
import {
  epleyEstimatedOneRepMax,
  recommendProgression,
} from "@/server/progression/rules";
import { GEMINI_BASE_URL, getGeminiModel } from "@/server/ai/models";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const weeklyAiResponseSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  observations: z.array(z.string().trim().min(1).max(300)).max(6),
  selectedActionIds: z.array(z.string().trim().min(1).max(160)).max(6),
  deloadReasons: z.array(z.string().trim().min(1).max(300)).max(5),
});

type WeeklyFacts = {
  completion: string;
  observations: string[];
  actions: WeeklyAnalysisAction[];
  deloadRecommended: boolean;
  deloadReasons: string[];
};

export async function generateAndSaveWeeklyAnalysis(
  supabase: SupabaseClient,
  userId: string,
  weekStartKey: string,
  now = new Date(),
) {
  const selectedRange = getSingaporeWeekRangeFromKey(weekStartKey);
  const comparisonRange = {
    weekStart: new Date(selectedRange.weekStart.getTime() - WEEK_MS),
    weekEnd: selectedRange.weekStart,
  };
  const currentWeekKey = formatSingaporeDateKey(
    getSundayWeekRangeSingapore(now).weekStart,
  );
  if (
    formatSingaporeDateKey(getSundayWeekRangeSingapore(selectedRange.weekStart).weekStart) !==
      weekStartKey ||
    weekStartKey > currentWeekKey
  ) {
    throw new Error("Week start must be a non-future Sunday in Singapore time.");
  }

  const analysisEnd = weekStartKey === currentWeekKey ? now : selectedRange.weekEnd;
  const [selectedSessions, comparisonSessions, preferences, deloadWeeks] =
    await Promise.all([
      listCompletedSessionDetailsInRange(
        supabase,
        userId,
        selectedRange.weekStart.toISOString(),
        analysisEnd.toISOString(),
      ),
      listCompletedSessionDetailsInRange(
        supabase,
        userId,
        comparisonRange.weekStart.toISOString(),
        comparisonRange.weekEnd.toISOString(),
      ),
      getProfilePreferences(supabase, userId),
      listDeloadWeeks(supabase, userId),
    ]);
  const nextWeekKey = formatSingaporeDateKey(selectedRange.weekEnd);
  const confirmedForSelectedWeek = deloadWeeks.some(
    (week) => week.week_start === weekStartKey,
  );
  const confirmedForNextWeek = deloadWeeks.some(
    (week) => week.week_start === nextWeekKey,
  );
  const facts = buildWeeklyFacts(
    selectedSessions,
    comparisonSessions,
    preferences.weeklyWorkoutTarget,
    preferences.weeklyMuscleTargets,
    confirmedForSelectedWeek,
    confirmedForNextWeek,
  );
  const model = getGeminiModel();
  const ai = await requestWeeklyAiSummary(model, facts, selectedSessions).catch(
    () => null,
  );
  const selectedActions = ai
    ? ai.selectedActionIds
        .map((id) => facts.actions.find((action) => action.id === id))
        .filter((action): action is WeeklyAnalysisAction => Boolean(action))
    : [];
  const analysis: WeeklyAnalysis = {
    schemaVersion: 1,
    weekStart: weekStartKey,
    weekEnd: formatSingaporeDateKey(selectedRange.weekEnd),
    comparisonWeekStart: formatSingaporeDateKey(comparisonRange.weekStart),
    comparisonWeekEnd: weekStartKey,
    isCurrentWeek: weekStartKey === currentWeekKey,
    workoutsCompleted: selectedSessions.length,
    workoutTarget: preferences.weeklyWorkoutTarget,
    targetSnapshot: preferences.weeklyMuscleTargets,
    summary: ai?.summary ?? facts.completion,
    observations: ai?.observations.length ? ai.observations : facts.observations,
    nextWeekActions: selectedActions.length ? selectedActions : facts.actions.slice(0, 6),
    deload: {
      recommended: facts.deloadRecommended,
      confirmedForSelectedWeek,
      confirmedForNextWeek,
      reasons: ai?.deloadReasons.length ? ai.deloadReasons : facts.deloadReasons,
    },
  };

  return saveWeeklyAnalysis(
    supabase,
    userId,
    weekStartKey,
    ai ? "gemini" : "fallback",
    model,
    analysis,
  );
}

export function buildWeeklyFacts(
  selectedSessions: SessionWithDetails[],
  comparisonSessions: SessionWithDetails[],
  workoutTarget: number,
  targets: WeeklyMuscleTargetSettings,
  confirmedForSelectedWeek = false,
  confirmedForNextWeek = false,
): WeeklyFacts {
  const progress = buildWeeklyMuscleSetProgress(selectedSessions, targets);
  const observations = buildPerformanceObservations(
    selectedSessions,
    comparisonSessions,
  );
  for (const item of progress.filter((item) => item.sets < item.minimum)) {
    observations.push(
      `${capitalize(item.muscleGroup)} volume was ${formatNumber(item.sets)} sets, below the ${formatNumber(item.minimum)}-${formatNumber(item.maximum)} preferred range.`,
    );
  }
  if (observations.length === 0) {
    observations.push("No clear performance change or weekly volume deficit was detected.");
  }

  const fatigue = detectDeloadSignals(selectedSessions, comparisonSessions);
  const deloadRecommended = confirmedForSelectedWeek
    ? false
    : selectedSessions.length >= 2 &&
      (fatigue.categories.length >= 2 || fatigue.painSessionCount >= 2);
  const actions = confirmedForNextWeek
    ? buildDeloadActions(selectedSessions)
    : buildNormalActions(selectedSessions, progress, fatigue, deloadRecommended);

  return {
    completion: `Completed ${selectedSessions.length} of ${workoutTarget} sessions.`,
    observations: observations.slice(0, 6),
    actions,
    deloadRecommended,
    deloadReasons: confirmedForSelectedWeek
      ? ["This week is already marked as a deload."]
      : fatigue.reasons,
  };
}

function detectDeloadSignals(
  selected: SessionWithDetails[],
  comparison: SessionWithDetails[],
) {
  const painSessions = new Set<string>();
  const highRpeSessions = new Set<string>();
  const missedTargetSessions = new Set<string>();

  for (const session of selected) {
    if (sessionMentionsPain(session)) painSessions.add(session.id);
    for (const exercise of session.session_exercises) {
      const completed = exercise.session_sets.filter((set) => set.completed);
      if (completed.some((set) => (set.rpe ?? 0) >= 9)) highRpeSessions.add(session.id);
      if (
        completed.length < exercise.planned_sets ||
        completed.slice(0, exercise.planned_sets).some(
          (set) => set.reps < exercise.target_reps_min,
        )
      ) missedTargetSessions.add(session.id);
    }
  }

  const performanceDrops = findPerformanceDrops([...selected, ...comparison]);
  const categories: string[] = [];
  const reasons: string[] = [];
  if (painSessions.size > 0) {
    categories.push("pain");
    reasons.push(`Pain was recorded in ${painSessions.size} session${painSessions.size === 1 ? "" : "s"}.`);
  }
  if (highRpeSessions.size >= 2) {
    categories.push("high_rpe");
    reasons.push(`RPE 9 or higher appeared across ${highRpeSessions.size} sessions.`);
  }
  if (missedTargetSessions.size >= 2) {
    categories.push("missed_targets");
    reasons.push(`Planned sets or minimum reps were missed across ${missedTargetSessions.size} sessions.`);
  }
  if (performanceDrops.length > 0) {
    categories.push("performance_drop");
    reasons.push(`Performance dropped for ${performanceDrops.join(", ")}.`);
  }

  return {
    categories,
    reasons,
    painSessionCount: painSessions.size,
  };
}

function buildNormalActions(
  sessions: SessionWithDetails[],
  progress: ReturnType<typeof buildWeeklyMuscleSetProgress>,
  fatigue: ReturnType<typeof detectDeloadSignals>,
  deloadRecommended: boolean,
) {
  if (deloadRecommended) {
    return [{
      id: "confirm-deload",
      text: "Consider confirming next week as a deload before adding load or volume.",
    }];
  }
  const actions: WeeklyAnalysisAction[] = [];
  const seen = new Set<string>();
  for (const session of sessions.toSorted(
    (left, right) => Date.parse(right.performed_at) - Date.parse(left.performed_at),
  )) {
    for (const exercise of session.session_exercises) {
      if (seen.has(exercise.exercise_id)) continue;
      seen.add(exercise.exercise_id);
      const recommendation = recommendProgression({
        sessionExercise: exercise,
        sets: exercise.session_sets,
        sessionNotes: session.notes,
      });
      actions.push({
        id: `exercise:${exercise.exercise_id}`,
        text: `${recommendation.exerciseName}: ${recommendation.reason} ${recommendation.suggestedTarget.notes ?? ""}`.trim(),
      });
    }
  }
  for (const item of progress.filter((item) => item.sets < item.minimum)) {
    actions.push({
      id: `muscle:${item.muscleGroup}`,
      text: `Include one additional ${item.muscleGroup} working set if recovery remains good.`,
    });
  }
  return actions.slice(0, 10);
}

function buildDeloadActions(sessions: SessionWithDetails[]) {
  const actions: WeeklyAnalysisAction[] = [];
  const seen = new Set<string>();
  for (const session of sessions.toSorted(
    (left, right) => Date.parse(right.performed_at) - Date.parse(left.performed_at),
  )) {
    for (const exercise of session.session_exercises) {
      if (seen.has(exercise.exercise_id)) continue;
      seen.add(exercise.exercise_id);
      const completed = exercise.session_sets.filter((set) => set.completed);
      const recentWeight = Math.max(0, ...completed.map((set) => set.weight_kg));
      const increment = exercise.exercise.default_increment_kg;
      const reducedWeight = increment > 0
        ? Math.floor((recentWeight * 0.9) / increment) * increment
        : recentWeight * 0.9;
      actions.push({
        id: `deload:${exercise.exercise_id}`,
        text: `${exercise.exercise.name}: ${Math.max(1, Math.ceil(exercise.planned_sets / 2))} working sets at ${formatNumber(reducedWeight)}kg, keeping the current rep range.`,
      });
    }
  }
  return actions.slice(0, 10);
}

function buildPerformanceObservations(
  selected: SessionWithDetails[],
  comparison: SessionWithDetails[],
) {
  const current = exercisePerformance(selected);
  const previous = exercisePerformance(comparison);
  const observations: string[] = [];
  for (const [exerciseId, value] of current) {
    const baseline = previous.get(exerciseId);
    if (!baseline) continue;
    const status = value.bestE1rm > baseline.bestE1rm
      ? "improved"
      : value.bestE1rm < baseline.bestE1rm
        ? "declined"
        : "remained unchanged";
    observations.push(`${value.name} performance ${status} versus the previous week.`);
  }
  return observations;
}

function findPerformanceDrops(sessions: SessionWithDetails[]) {
  const latestWeekStart = sessions.length > 0
    ? getSundayWeekRangeSingapore(
        new Date(Math.max(...sessions.map((session) => Date.parse(session.performed_at)))),
      ).weekStart.getTime()
    : 0;
  const exposures = new Map<string, Array<{ date: number; e1rm: number; volume: number; name: string }>>();
  for (const session of sessions) {
    for (const exercise of session.session_exercises.filter(
      (item) => item.exercise.is_main_lift,
    )) {
      const completed = exercise.session_sets.filter((set) => set.completed);
      if (completed.length === 0) continue;
      const list = exposures.get(exercise.exercise_id) ?? [];
      list.push({
        date: Date.parse(session.performed_at),
        e1rm: Math.max(...completed.map((set) => epleyEstimatedOneRepMax(set.weight_kg, set.reps))),
        volume: completed.reduce((sum, set) =>
          sum + sessionSetVolume(set, exercise.exercise.volume_multiplier), 0),
        name: exercise.exercise.name,
      });
      exposures.set(exercise.exercise_id, list);
    }
  }
  return [...exposures.values()].flatMap((items) => {
    const [latest, previous] = items.toSorted((a, b) => b.date - a.date);
    return latest && previous &&
      getSundayWeekRangeSingapore(new Date(latest.date)).weekStart.getTime() === latestWeekStart &&
      latest.e1rm < previous.e1rm && latest.volume < previous.volume
      ? [latest.name]
      : [];
  });
}

function exercisePerformance(sessions: SessionWithDetails[]) {
  const result = new Map<string, { name: string; bestE1rm: number }>();
  for (const session of sessions) {
    for (const exercise of session.session_exercises) {
      const completed = exercise.session_sets.filter((set) => set.completed);
      if (completed.length === 0) continue;
      const bestE1rm = Math.max(...completed.map((set) =>
        epleyEstimatedOneRepMax(set.weight_kg, set.reps),
      ));
      const existing = result.get(exercise.exercise_id);
      if (!existing || bestE1rm > existing.bestE1rm) {
        result.set(exercise.exercise_id, {
          name: exercise.exercise.name,
          bestE1rm,
        });
      }
    }
  }
  return result;
}

async function requestWeeklyAiSummary(
  model: string,
  facts: WeeklyFacts,
  sessions: SessionWithDetails[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(
    `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(facts, sessions) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini weekly analysis failed: ${response.status}`);
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.flatMap((item) => item.content?.parts ?? [])
    .map((part) => part.text).filter(Boolean).join("\n") ?? "";
  return weeklyAiResponseSchema.parse(JSON.parse(text));
}

function buildPrompt(facts: WeeklyFacts, sessions: SessionWithDetails[]) {
  return `You are NextSet, a concise conservative training analyst.
Return JSON only: {"summary":"text","observations":["text"],"selectedActionIds":["id"],"deloadReasons":["text"]}.
Use only the supplied evidence. Never invent an exercise, result, or action. Select only IDs from allowedActions. The server's deload result is authoritative. Keep the tone factual and brief.
Evidence: ${JSON.stringify({
    completion: facts.completion,
    observations: facts.observations,
    deloadRecommended: facts.deloadRecommended,
    deloadReasons: facts.deloadReasons,
    allowedActions: facts.actions,
    sessions: compactSessions(sessions),
  })}`;
}

function compactSessions(sessions: SessionWithDetails[]) {
  return sessions.map((session) => ({
    name: session.name,
    performedAt: session.performed_at,
    notes: session.notes,
    exercises: session.session_exercises.map((exercise) => ({
      name: exercise.exercise.name,
      target: `${exercise.planned_sets}x${exercise.target_reps_min}-${exercise.target_reps_max}`,
      sets: exercise.session_sets.filter((set) => set.completed).map((set) => ({
        weightKg: set.weight_kg,
        reps: set.reps,
        rpe: set.rpe,
        note: set.note,
      })),
    })),
  }));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
