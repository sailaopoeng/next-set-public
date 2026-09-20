import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsSession } from "@/server/analytics/calculations";
import {
  filterHistoryRows,
  type HistoryFilters,
  type HistoryIndexRow,
} from "@/lib/history-filters";

import type {
  Exercise,
  DeloadWeek,
  SavedWeeklyAnalysis,
  SessionSet,
  SessionWithDetails,
  TemplateExercise,
  WorkoutSession,
  WorkoutSuggestion,
  WorkoutTemplate,
} from "@/lib/domain";
import {
  normalizeWeeklyMuscleTargetSettings,
  type WeeklyMuscleTargetSettings,
} from "@/lib/weekly-targets";
import {
  pickLatestPreviousPerformance,
  type PreviousExercisePerformance,
  type PreviousSetSourceSession,
} from "@/lib/previous-sets";
import type {
  liveSessionSyncSchema,
  preparedSessionSchema,
  setInputSchema,
  suggestedTargetSchema,
} from "@/lib/validation/schemas";
import { weeklyAnalysisSchema } from "@/lib/validation/schemas";
import type { z } from "zod";

export async function ensureProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
) {
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name:
      typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null,
  });

  if (error) {
    throw error;
  }
}

export async function getProfilePreferences(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("weekly_workout_target, weekly_muscle_targets")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return {
    weeklyWorkoutTarget: Number(data.weekly_workout_target ?? 3),
    weeklyMuscleTargets: normalizeWeeklyMuscleTargetSettings(
      data.weekly_muscle_targets,
    ),
  };
}

export async function updateWeeklyWorkoutTarget(
  supabase: SupabaseClient,
  userId: string,
  target: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ weekly_workout_target: target })
    .eq("id", userId)
    .select("weekly_workout_target")
    .single();

  if (error) throw error;
  return Number(data.weekly_workout_target);
}

export async function updateWeeklyMuscleTargets(
  supabase: SupabaseClient,
  userId: string,
  targets: WeeklyMuscleTargetSettings,
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ weekly_muscle_targets: targets })
    .eq("id", userId)
    .select("weekly_muscle_targets")
    .single();

  if (error) throw error;
  return normalizeWeeklyMuscleTargetSettings(data.weekly_muscle_targets);
}

export async function listWeeklyAnalyses(
  supabase: SupabaseClient,
  userId: string,
): Promise<SavedWeeklyAnalysis[]> {
  const { data, error } = await supabase
    .from("weekly_ai_analyses")
    .select("id, week_start, provider, model, analysis_json, updated_at")
    .eq("user_id", userId)
    .order("week_start", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    analysis_json: weeklyAnalysisSchema.parse(row.analysis_json),
  })) as SavedWeeklyAnalysis[];
}

export async function saveWeeklyAnalysis(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  provider: string,
  model: string,
  analysis: SavedWeeklyAnalysis["analysis_json"],
) {
  const { data, error } = await supabase
    .from("weekly_ai_analyses")
    .upsert(
      {
        user_id: userId,
        week_start: weekStart,
        provider,
        model,
        analysis_json: weeklyAnalysisSchema.parse(analysis),
      },
      { onConflict: "user_id,week_start" },
    )
    .select("id, week_start, provider, model, analysis_json, updated_at")
    .single();

  if (error) throw error;
  return {
    ...data,
    analysis_json: weeklyAnalysisSchema.parse(data.analysis_json),
  } as SavedWeeklyAnalysis;
}

export async function listDeloadWeeks(
  supabase: SupabaseClient,
  userId: string,
): Promise<DeloadWeek[]> {
  const { data, error } = await supabase
    .from("deload_weeks")
    .select("week_start, source")
    .eq("user_id", userId)
    .order("week_start", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DeloadWeek[];
}

export async function setDeloadWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  source: DeloadWeek["source"],
) {
  const { error } = await supabase.from("deload_weeks").upsert(
    { user_id: userId, week_start: weekStart, source },
    { onConflict: "user_id,week_start" },
  );
  if (error) throw error;
}

export async function removeDeloadWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
) {
  const { error } = await supabase
    .from("deload_weeks")
    .delete()
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

export async function listExercises(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeExercise);
}

export async function listAiSuggestionExercises(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("user_id", userId)
    .eq("is_ai_suggestion_enabled", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeExercise);
}

export async function listTemplates(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select("*, workout_template_exercises(*, exercise:exercises(*))")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("exercise_order", {
      ascending: true,
      referencedTable: "workout_template_exercises",
    });

  if (error) throw error;
  return (data ?? []).map(normalizeTemplate);
}

export async function findLatestAcceptedSuggestion(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workout_suggestions")
    .select("*, workout_suggestion_exercises(*, exercise:exercises(*))")
    .eq("user_id", userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeSuggestion(data) : null;
}

export async function getTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select("*, workout_template_exercises(*, exercise:exercises(*))")
    .eq("user_id", userId)
    .eq("id", templateId)
    .single();

  if (error) throw error;
  return normalizeTemplate(data);
}

export async function findTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select("*, workout_template_exercises(*, exercise:exercises(*))")
    .eq("user_id", userId)
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeTemplate(data) : null;
}

export async function listRecentSessions(
  supabase: SupabaseClient,
  userId: string,
  limit = 8,
) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(normalizeSessionDetails);
}

export async function listHistorySessions(
  supabase: SupabaseClient,
  userId: string,
  filters: HistoryFilters,
): Promise<{ sessions: SessionWithDetails[]; total: number; page: number; pageCount: number }> {
  const indexPageSize = 250;
  const historyRows: HistoryIndexRow[] = [];
  for (let start = 0; ; start += indexPageSize) {
    let query = supabase
      .from("workout_sessions")
      .select("id,name,template_id,performed_at,session_exercises(exercise:exercises(name))")
      .eq("user_id", userId)
      .order("performed_at", { ascending: false });
    if (filters.templateId) query = query.eq("template_id", filters.templateId);
    if (filters.from) query = query.gte("performed_at", `${filters.from}T00:00:00+08:00`);
    if (filters.to) {
      const end = new Date(new Date(`${filters.to}T00:00:00+08:00`).getTime() + 86_400_000);
      query = query.lt("performed_at", end.toISOString());
    }
    const { data, error } = await query.range(start, start + indexPageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as HistoryIndexRow[];
    historyRows.push(...rows);
    if (rows.length < indexPageSize) break;
  }

  const matches = filterHistoryRows(historyRows, filters);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(filters.page, pageCount);
  const ids = matches.slice((page - 1) * pageSize, page * pageSize).map((row) => row.id);
  if (ids.length === 0) return { sessions: [], total: matches.length, page, pageCount };

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [String(row.id), normalizeSessionDetails(row)]));
  return {
    sessions: ids.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []),
    total: matches.length,
    page,
    pageCount,
  };
}

export async function findActiveSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionWithDetails | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = data?.[0];
  return row ? normalizeSessionDetails(row) : null;
}

export async function listLatestCompletedSetsByExerciseIds(
  supabase: SupabaseClient,
  userId: string,
  exerciseIds: string[],
  excludeSessionId: string,
): Promise<Record<string, PreviousExercisePerformance>> {
  if (exerciseIds.length === 0) return {};

  const uniqueExerciseIds = [...new Set(exerciseIds)];
  const results = await Promise.all(uniqueExerciseIds.map(async (exerciseId) => {
    // Search only this exercise, and keep paging until a completed set is found.
    // A fixed window of recent workouts can miss an infrequently trained lift.
    const pageSize = 20;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select(
          "id, performed_at, session_exercises!inner(exercise_id, session_sets(set_number, weight_kg, reps, rpe, completed))",
        )
        .eq("user_id", userId)
        .eq("status", "completed")
        .neq("id", excludeSessionId)
        .eq("session_exercises.exercise_id", exerciseId)
        .order("performed_at", { ascending: false })
        .range(start, start + pageSize - 1);

      if (error) throw error;
      const rows = (data ?? []) as PreviousSetSourceSession[];
      const previous = pickLatestPreviousPerformance(rows, [exerciseId])[exerciseId];
      if (previous) return [exerciseId, previous] as const;
      if (rows.length < pageSize) return null;
    }
  }));

  return Object.fromEntries(results.filter((result) => result !== null));
}

export async function findLatestCompletedSetsForExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
  excludeSessionId: string,
): Promise<PreviousExercisePerformance | null> {
  const previous = await listLatestCompletedSetsByExerciseIds(
    supabase,
    userId,
    [exerciseId],
    excludeSessionId,
  );
  return previous[exerciseId] ?? null;
}

export async function getSessionDetails(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<SessionWithDetails> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .single();

  if (error) throw error;
  return normalizeSessionDetails(data);
}

export async function findSessionDetails(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<SessionWithDetails | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeSessionDetails(data) : null;
}

export async function startSessionFromTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
) {
  const template = await getTemplate(supabase, userId, templateId);
  const sessionId = crypto.randomUUID();
  await createWorkoutSessionSnapshot(supabase, {
    sessionId,
    templateId: template.id,
    sourceSuggestionId: null,
    name: template.name,
    notes: null,
    exercises: buildSessionSnapshotExercises(
      template.workout_template_exercises,
    ),
  });

  return getSessionDetails(supabase, userId, sessionId);
}

export async function startEmptySession(
  supabase: SupabaseClient,
  userId: string,
) {
  const sessionId = crypto.randomUUID();
  await createWorkoutSessionSnapshot(supabase, {
    sessionId,
    templateId: null,
    sourceSuggestionId: null,
    name: "Custom workout",
    notes: null,
    exercises: [],
  });

  return getSessionDetails(supabase, userId, sessionId);
}

export async function startPreparedSession(
  supabase: SupabaseClient,
  userId: string,
  prepared: z.infer<typeof preparedSessionSchema>,
) {
  const sessionId = crypto.randomUUID();
  await createWorkoutSessionSnapshot(supabase, {
    sessionId,
    templateId: prepared.sourceTemplateId,
    sourceSuggestionId: null,
    name: prepared.name,
    notes: prepared.notes,
    exercises: buildSessionSnapshotExercises(prepared.exercises.map((exercise) => ({
      id: crypto.randomUUID(),
      template_id: prepared.sourceTemplateId ?? "",
      exercise_id: exercise.exerciseId,
      exercise_order: exercise.exerciseOrder,
      target_sets: exercise.targetSets,
      target_reps_min: exercise.targetRepsMin,
      target_reps_max: exercise.targetRepsMax,
      target_weight_kg: exercise.targetWeightKg,
      target_set_weights_kg: exercise.targetSetWeightsKg,
      rest_seconds: exercise.restSeconds,
      superset_group_id: exercise.supersetGroupId,
      notes: exercise.notes,
    }))),
  });

  return getSessionDetails(supabase, userId, sessionId);
}

export async function startSessionFromSuggestion(
  supabase: SupabaseClient,
  userId: string,
  suggestionId: string,
) {
  const { data: suggestion, error } = await supabase
    .from("workout_suggestions")
    .select("*, workout_suggestion_exercises(*, exercise:exercises(*))")
    .eq("user_id", userId)
    .eq("id", suggestionId)
    .single();

  if (error) throw error;

  const sessionId = crypto.randomUUID();
  const source = suggestion as WorkoutSuggestion & {
    workout_suggestion_exercises: Array<
      TemplateExercise & { exercise: Exercise }
    >;
  };
  await createWorkoutSessionSnapshot(supabase, {
    sessionId,
    templateId: source.source_template_id,
    sourceSuggestionId: suggestionId,
    name: source.name,
    notes: null,
    exercises: buildSessionSnapshotExercises(source.workout_suggestion_exercises.map((exercise) => ({
      ...exercise,
      template_id: source.source_template_id ?? "",
      target_set_weights_kg: [],
      target_weight_kg: exercise.target_weight_kg,
      superset_group_id: null,
    }))),
  });

  return getSessionDetails(supabase, userId, sessionId);
}

type SessionSnapshotExercise = {
  id: string;
  exercise_id: string;
  exercise_order: number;
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  rest_seconds: number;
  superset_group_id: string | null;
  notes: string | null;
  sets: Array<{
    id: string;
    set_number: number;
    weight_kg: number;
    reps: number;
    rpe: number | null;
    completed: boolean;
    note: string | null;
  }>;
};

function buildSessionSnapshotExercises(
  exercises: TemplateExercise[],
): SessionSnapshotExercise[] {
  return exercises
    .toSorted((left, right) => left.exercise_order - right.exercise_order)
    .map((exercise, exerciseIndex) => {
      const sessionExerciseId = crypto.randomUUID();
      return {
        id: sessionExerciseId,
        exercise_id: exercise.exercise_id,
        exercise_order: exerciseIndex + 1,
        target_reps_min: exercise.target_reps_min,
        target_reps_max: exercise.target_reps_max,
        target_weight_kg: exercise.target_weight_kg,
        rest_seconds: exercise.rest_seconds,
        superset_group_id: exercise.superset_group_id ?? null,
        notes: exercise.notes,
        sets: Array.from({ length: exercise.target_sets }, (_, setIndex) => ({
          id: crypto.randomUUID(),
          set_number: setIndex + 1,
          weight_kg:
            exercise.target_set_weights_kg[setIndex] ??
            exercise.target_weight_kg ??
            0,
          reps: 0,
          rpe: null,
          completed: false,
          note: null,
        })),
      };
    });
}

async function createWorkoutSessionSnapshot(
  supabase: SupabaseClient,
  input: {
    sessionId: string;
    templateId: string | null;
    sourceSuggestionId: string | null;
    name: string;
    notes: string | null;
    exercises: SessionSnapshotExercise[];
  },
) {
  const { error } = await supabase.rpc("create_workout_session_snapshot", {
    p_session_id: input.sessionId,
    p_template_id: input.templateId,
    p_source_suggestion_id: input.sourceSuggestionId,
    p_name: input.name,
    p_notes: input.notes,
    p_exercises: input.exercises,
  });

  if (error) throw error;
}

export async function syncLiveSession(
  supabase: SupabaseClient,
  sessionId: string,
  payload: z.infer<typeof liveSessionSyncSchema>,
) {
  const { data, error } = await supabase.rpc("sync_live_session", {
    p_session_id: sessionId,
    p_performed_at: payload.performedAt,
    p_notes: payload.notes,
    p_exercises: payload.exercises.map((exercise) => ({
      id: exercise.id,
      exercise_id: exercise.exerciseId,
      exercise_order: exercise.exerciseOrder,
      target_reps_min: exercise.targetRepsMin,
      target_reps_max: exercise.targetRepsMax,
      target_weight_kg: exercise.targetWeightKg,
      rest_seconds: exercise.restSeconds,
      superset_group_id: exercise.supersetGroupId,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        set_number: set.setNumber,
        weight_kg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        completed: set.completed,
        note: set.note,
      })),
    })),
  });

  if (error) throw error;
  return { syncedAt: String(data) };
}

export async function upsertSessionSets(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  sets: Array<z.infer<typeof setInputSchema>>,
) {
  await ensureEditableSession(supabase, userId, sessionId);
  const validSessionExerciseIds = await listSessionExerciseIds(
    supabase,
    userId,
    sessionId,
  );
  const validSessionSetIds = await listSessionSetIds(supabase, userId, sessionId);

  for (const set of sets) {
    if (!validSessionExerciseIds.has(set.sessionExerciseId)) {
      throw new Error("Set does not belong to this workout.");
    }
    if (set.id && !validSessionSetIds.has(set.id)) {
      throw new Error("Set does not belong to this workout.");
    }
  }

  const rows = sets.map((set) => ({
    ...(set.id ? { id: set.id } : {}),
    user_id: userId,
    session_id: sessionId,
    session_exercise_id: set.sessionExerciseId,
    set_number: set.setNumber,
    weight_kg: set.weightKg,
    reps: set.reps,
    rpe: set.rpe,
    completed: set.completed,
    note: set.note,
  }));
  const { data, error } = await supabase
    .from("session_sets")
    .upsert(rows)
    .select("*");

  if (error) throw error;
  return data ?? [];
}

export async function addSessionExercise(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  exerciseId: string,
  sessionExerciseId: string = crypto.randomUUID(),
  initialSetId: string = crypto.randomUUID(),
) {
  await ensureEditableSession(supabase, userId, sessionId);

  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("*")
    .eq("user_id", userId)
    .eq("id", exerciseId)
    .single();

  if (exerciseError) throw exerciseError;

  const { data: existingExercises, error: listError } = await supabase
    .from("session_exercises")
    .select("exercise_order")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("exercise_order", { ascending: false })
    .limit(1);

  if (listError) throw listError;

  const exerciseOrder =
    Number(existingExercises?.[0]?.exercise_order ?? 0) + 1;
  const targetWeightKg = 0;
  const { error: insertError } = await supabase.from("session_exercises").insert({
    id: sessionExerciseId,
    user_id: userId,
    session_id: sessionId,
    exercise_id: String(exercise.id),
    exercise_order: exerciseOrder,
    planned_sets: 1,
    target_reps_min: 8,
    target_reps_max: 12,
    target_weight_kg: targetWeightKg,
    rest_seconds: 90,
    notes: null,
  });

  if (insertError) throw insertError;

  const { error: setError } = await supabase.from("session_sets").insert({
    id: initialSetId,
    user_id: userId,
    session_id: sessionId,
    session_exercise_id: sessionExerciseId,
    set_number: 1,
    weight_kg: targetWeightKg,
    reps: 0,
    rpe: null,
    completed: false,
    note: null,
  });

  if (setError) throw setError;
  return getSessionDetails(supabase, userId, sessionId);
}

export async function removeSessionExercise(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  sessionExerciseId: string,
) {
  await ensureEditableSession(supabase, userId, sessionId);

  const { data: removedExercise, error: lookupError } = await supabase
    .from("session_exercises")
    .select("superset_group_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId)
    .single();

  if (lookupError) throw lookupError;

  const { error } = await supabase
    .from("session_exercises")
    .delete()
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId);

  if (error) throw error;
  if (removedExercise.superset_group_id) {
    const { error: clearError } = await supabase
      .from("session_exercises")
      .update({ superset_group_id: null })
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("superset_group_id", removedExercise.superset_group_id);
    if (clearError) throw clearError;
  }
  return getSessionDetails(supabase, userId, sessionId);
}

export async function reorderSessionExercises(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  exerciseIds: string[],
) {
  await ensureEditableSession(supabase, userId, sessionId);
  await validateExerciseOrder(
    supabase,
    "session_exercises",
    userId,
    "session_id",
    sessionId,
    exerciseIds,
  );

  await updateExerciseOrder(
    supabase,
    "session_exercises",
    userId,
    "session_id",
    sessionId,
    exerciseIds,
  );

  return getSessionDetails(supabase, userId, sessionId);
}

export async function replaceSessionSupersets(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  groups: Array<{
    groupId: string;
    exerciseIds: [string, string];
    restSeconds: number;
  }>,
) {
  await ensureEditableSession(supabase, userId, sessionId);
  const { error } = await supabase.rpc("replace_session_supersets", {
    p_session_id: sessionId,
    p_groups: groups.map((group) => ({
      group_id: group.groupId,
      exercise_ids: group.exerciseIds,
      rest_seconds: group.restSeconds,
    })),
  });

  if (error) throw error;
  return getSessionDetails(supabase, userId, sessionId);
}

export async function replaceSessionExercise(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  sessionExerciseId: string,
  replacementExerciseId: string,
  target: z.infer<typeof suggestedTargetSchema>,
) {
  await ensureEditableSession(supabase, userId, sessionId);
  await ensureExerciseBelongsToUser(supabase, userId, replacementExerciseId);
  await ensureNoDuplicateSessionExercise(
    supabase,
    userId,
    sessionId,
    sessionExerciseId,
    replacementExerciseId,
  );

  const { data: currentExercise, error: currentExerciseError } = await supabase
    .from("session_exercises")
    .select("planned_sets,rest_seconds,superset_group_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId)
    .single();

  if (currentExerciseError) throw currentExerciseError;

  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("id,reps,rpe,completed,note")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("session_exercise_id", sessionExerciseId);

  if (setsError) throw setsError;
  const hasLoggedValues = (sets ?? []).some(
    (set) =>
      Number(set.reps) > 0 ||
      set.rpe !== null ||
      Boolean(set.completed) ||
      nullableString(set.note) !== null,
  );
  const plannedSets = currentExercise.superset_group_id
    ? Number(currentExercise.planned_sets)
    : hasLoggedValues
      ? Math.max(1, sets?.length ?? 1)
      : target.sets;

  const { error } = await supabase
    .from("session_exercises")
    .update({
      exercise_id: replacementExerciseId,
      planned_sets: plannedSets,
      target_reps_min: target.repsMin,
      target_reps_max: target.repsMax,
      target_weight_kg: target.weightKg,
      rest_seconds: currentExercise.superset_group_id
        ? Number(currentExercise.rest_seconds)
        : target.restSeconds,
      notes: target.notes,
    })
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId);

  if (error) throw error;

  if (!hasLoggedValues) {
    const { error: deleteError } = await supabase
      .from("session_sets")
      .delete()
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("session_exercise_id", sessionExerciseId);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from("session_sets").insert(
      Array.from({ length: plannedSets }, (_, index) => ({
        user_id: userId,
        session_id: sessionId,
        session_exercise_id: sessionExerciseId,
        set_number: index + 1,
        weight_kg: target.weightKg ?? 0,
        reps: 0,
        rpe: null,
        completed: false,
        note: null,
      })),
    );

    if (insertError) throw insertError;
  }

  return getSessionDetails(supabase, userId, sessionId);
}

export async function reorderSuggestionExercises(
  supabase: SupabaseClient,
  userId: string,
  suggestionId: string,
  exerciseIds: string[],
) {
  await validateExerciseOrder(
    supabase,
    "workout_suggestion_exercises",
    userId,
    "suggestion_id",
    suggestionId,
    exerciseIds,
  );

  await updateExerciseOrder(
    supabase,
    "workout_suggestion_exercises",
    userId,
    "suggestion_id",
    suggestionId,
    exerciseIds,
  );
}

export async function replaceSuggestionExercise(
  supabase: SupabaseClient,
  userId: string,
  suggestionId: string,
  suggestionExerciseId: string,
  replacementExerciseId: string,
  target: z.infer<typeof suggestedTargetSchema>,
) {
  await ensureEditableSuggestion(supabase, userId, suggestionId);
  await ensureExerciseBelongsToUser(supabase, userId, replacementExerciseId);
  await ensureNoDuplicateSuggestionExercise(
    supabase,
    userId,
    suggestionId,
    suggestionExerciseId,
    replacementExerciseId,
  );

  const { data, error } = await supabase
    .from("workout_suggestion_exercises")
    .update({
      exercise_id: replacementExerciseId,
      target_sets: target.sets,
      target_reps_min: target.repsMin,
      target_reps_max: target.repsMax,
      target_weight_kg: target.weightKg,
      rest_seconds: target.restSeconds,
      notes: target.notes,
    })
    .eq("user_id", userId)
    .eq("suggestion_id", suggestionId)
    .eq("id", suggestionExerciseId)
    .select("*, exercise:exercises(*)")
    .single();

  if (error) throw error;
  return data;
}

export async function addSessionSet(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  sessionExerciseId: string,
  setId: string = crypto.randomUUID(),
  partnerSetId?: string,
) {
  await ensureEditableSession(supabase, userId, sessionId);

  const { data: sessionExercise, error: exerciseError } = await supabase
    .from("session_exercises")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId)
    .single();

  if (exerciseError) throw exerciseError;

  if (sessionExercise.superset_group_id) {
    if (!partnerSetId) throw new Error("A superset round requires two set IDs.");
    const { data: group, error: groupError } = await supabase
      .from("session_exercises")
      .select("id,target_weight_kg")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("superset_group_id", sessionExercise.superset_group_id)
      .order("exercise_order", { ascending: true });
    if (groupError) throw groupError;
    if (group?.length !== 2) throw new Error("Superset must contain two exercises.");

    const groupIds = group.map((exercise) => String(exercise.id));
    const { data: groupSets, error: groupSetsError } = await supabase
      .from("session_sets")
      .select("session_exercise_id,set_number,weight_kg")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .in("session_exercise_id", groupIds);
    if (groupSetsError) throw groupSetsError;
    const setCounts = groupIds.map(
      (id) => groupSets?.filter((set) => String(set.session_exercise_id) === id).length ?? 0,
    );
    if (setCounts[0] !== setCounts[1] || setCounts[0] >= 12) {
      throw new Error("Superset rounds are out of sync or already at the limit.");
    }
    const nextSetNumber = setCounts[0] + 1;
    const setIds = [setId, partnerSetId];
    const { error: insertError } = await supabase.from("session_sets").insert(
      group.map((exercise, index) => {
        const previous = groupSets
          ?.filter((set) => String(set.session_exercise_id) === String(exercise.id))
          .toSorted((left, right) => Number(right.set_number) - Number(left.set_number))[0];
        return {
          id: setIds[index],
          user_id: userId,
          session_id: sessionId,
          session_exercise_id: exercise.id,
          set_number: nextSetNumber,
          weight_kg:
            nullableNumber(previous?.weight_kg) ??
            nullableNumber(exercise.target_weight_kg) ??
            0,
          reps: 0,
          rpe: null,
          completed: false,
          note: null,
        };
      }),
    );
    if (insertError) throw insertError;
    const { error: updateError } = await supabase
      .from("session_exercises")
      .update({ planned_sets: nextSetNumber })
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .in("id", groupIds);
    if (updateError) throw updateError;
    return getSessionDetails(supabase, userId, sessionId);
  }

  const { data: existingSets, error: setsError } = await supabase
    .from("session_sets")
    .select("set_number,weight_kg")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("session_exercise_id", sessionExerciseId)
    .order("set_number", { ascending: false })
    .limit(1);

  if (setsError) throw setsError;

  const lastSet = existingSets?.[0];
  const nextSetNumber = Number(lastSet?.set_number ?? 0) + 1;

  if (nextSetNumber > 12) {
    throw new Error("Session exercises can have at most 12 planned sets.");
  }

  const { error: setError } = await supabase.from("session_sets").insert({
    id: setId,
    user_id: userId,
    session_id: sessionId,
    session_exercise_id: sessionExerciseId,
    set_number: nextSetNumber,
    weight_kg:
      nullableNumber(lastSet?.weight_kg) ??
      nullableNumber(sessionExercise.target_weight_kg) ??
      0,
    reps: 0,
    rpe: null,
    completed: false,
    note: null,
  });

  if (setError) throw setError;

  const { error: updateError } = await supabase
    .from("session_exercises")
    .update({ planned_sets: nextSetNumber })
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId);

  if (updateError) throw updateError;
  return getSessionDetails(supabase, userId, sessionId);
}

export async function finishSession(
  supabase: SupabaseClient,
  sessionId: string,
  performedAt: string,
  notes: string | null,
) {
  const { data, error } = await supabase.rpc("complete_workout_session", {
    p_session_id: sessionId,
    p_performed_at: performedAt,
    p_notes: notes,
  });

  if (error) throw error;
  return {
    session: { id: sessionId, status: "completed" as const },
    newlyCompleted: Boolean(data),
  };
}

export async function updateSessionMetadata(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  performedAt: string,
  notes: string | null,
) {
  await ensureEditableSession(supabase, userId, sessionId);
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      performed_at: performedAt,
      notes,
    })
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (error) throw error;
  return getSessionDetails(supabase, userId, sessionId);
}

export async function cancelSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("source_suggestion_id")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .eq("status", "active")
    .single();

  if (sessionError) throw sessionError;

  const { error: deleteError } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("id", sessionId)
    .eq("status", "active")
    .select("id")
    .single();

  if (deleteError) throw deleteError;

  const suggestionId = nullableString(session.source_suggestion_id);
  if (!suggestionId) return;

  const { data: otherSessions, error: otherSessionError } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("source_suggestion_id", suggestionId)
    .limit(1);

  if (otherSessionError) throw otherSessionError;
  if ((otherSessions ?? []).length > 0) return;

  const { error: suggestionError } = await supabase
    .from("workout_suggestions")
    .update({ status: "accepted" })
    .eq("user_id", userId)
    .eq("id", suggestionId)
    .eq("status", "used");

  if (suggestionError) throw suggestionError;
}

export async function listCompletedSessionDetails(
  supabase: SupabaseClient,
  userId: string,
  limit = 80,
) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(normalizeSessionDetails);
}

export async function listCompletedSessionDetailsInRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string,
) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*, session_exercises(*, exercise:exercises(*), session_sets(*))")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("performed_at", start)
    .lt("performed_at", end)
    .order("performed_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeSessionDetails);
}

export async function listCompletedSessionsForExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<SessionWithDetails[]> {
  const pageSize = 250;
  const sessions: SessionWithDetails[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("*, session_exercises!inner(*, exercise:exercises(*), session_sets(*))")
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("session_exercises.exercise_id", exerciseId)
      .order("performed_at", { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []).map(normalizeSessionDetails);
    sessions.push(...page);
    if (page.length < pageSize) return sessions;
  }
}

export async function listAnalyticsSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<AnalyticsSession[]> {
  const pageSize = 250;
  const sessions: AnalyticsSession[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select(
        "id,name,status,performed_at,notes,session_exercises(exercise_id,notes,exercise:exercises(id,name,primary_muscle_group,secondary_muscle_groups,is_main_lift,volume_multiplier),session_sets(weight_kg,reps,rpe,completed,note))",
      )
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("session_exercises.session_sets.completed", true)
      .order("performed_at", { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as AnalyticsSession[];
    sessions.push(...page);
    if (page.length < pageSize) return sessions;
  }
}

async function ensureEditableSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("status")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .single();

  if (error) throw error;
  if (data.status === "cancelled") {
    throw new Error("Cancelled sessions cannot be edited.");
  }
}

async function ensureEditableSuggestion(
  supabase: SupabaseClient,
  userId: string,
  suggestionId: string,
) {
  const { data, error } = await supabase
    .from("workout_suggestions")
    .select("status")
    .eq("user_id", userId)
    .eq("id", suggestionId)
    .single();

  if (error) throw error;
  if (data.status === "used") {
    throw new Error("Used suggestions cannot be edited.");
  }
}

async function ensureExerciseBelongsToUser(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
) {
  const { error } = await supabase
    .from("exercises")
    .select("id")
    .eq("user_id", userId)
    .eq("id", exerciseId)
    .single();

  if (error) throw error;
}

async function ensureNoDuplicateSessionExercise(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  sessionExerciseId: string,
  replacementExerciseId: string,
) {
  const { data, error } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("exercise_id", replacementExerciseId);

  if (error) throw error;
  if ((data ?? []).some((row) => String(row.id) !== sessionExerciseId)) {
    throw new Error("This workout already includes that exercise.");
  }
}

async function ensureNoDuplicateSuggestionExercise(
  supabase: SupabaseClient,
  userId: string,
  suggestionId: string,
  suggestionExerciseId: string,
  replacementExerciseId: string,
) {
  const { data, error } = await supabase
    .from("workout_suggestion_exercises")
    .select("id")
    .eq("user_id", userId)
    .eq("suggestion_id", suggestionId)
    .eq("exercise_id", replacementExerciseId);

  if (error) throw error;
  if ((data ?? []).some((row) => String(row.id) !== suggestionExerciseId)) {
    throw new Error("This suggestion already includes that exercise.");
  }
}

async function listSessionExerciseIds(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("user_id", userId)
    .eq("session_id", sessionId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.id)));
}

async function listSessionSetIds(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("session_sets")
    .select("id")
    .eq("user_id", userId)
    .eq("session_id", sessionId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.id)));
}

export async function removeSessionSet(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  setId: string,
) {
  await ensureEditableSession(supabase, userId, sessionId);
  const { data: setRow, error: setError } = await supabase
    .from("session_sets")
    .select("id,session_exercise_id,set_number")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", setId)
    .single();

  if (setError) throw setError;
  const sessionExerciseId = String(setRow.session_exercise_id);

  const { data: sessionExercise, error: exerciseError } = await supabase
    .from("session_exercises")
    .select("superset_group_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId)
    .single();
  if (exerciseError) throw exerciseError;

  if (sessionExercise.superset_group_id) {
    const { data: group, error: groupError } = await supabase
      .from("session_exercises")
      .select("id")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("superset_group_id", sessionExercise.superset_group_id);
    if (groupError) throw groupError;
    if (group?.length !== 2) throw new Error("Superset must contain two exercises.");
    const groupIds = group.map((exercise) => String(exercise.id));
    const { data: groupSets, error: groupSetsError } = await supabase
      .from("session_sets")
      .select("id,session_exercise_id,set_number")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .in("session_exercise_id", groupIds);
    if (groupSetsError) throw groupSetsError;
    const setCounts = groupIds.map(
      (id) => groupSets?.filter((set) => String(set.session_exercise_id) === id).length ?? 0,
    );
    if (
      setCounts[0] !== setCounts[1] ||
      setCounts[0] <= 1 ||
      Number(setRow.set_number) !== setCounts[0]
    ) {
      throw new Error("Only the final complete superset round can be removed.");
    }
    const roundSetIds = (groupSets ?? [])
      .filter((set) => Number(set.set_number) === Number(setRow.set_number))
      .map((set) => String(set.id));
    if (roundSetIds.length !== 2) throw new Error("Superset round is incomplete.");
    const { error: deleteError } = await supabase
      .from("session_sets")
      .delete()
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .in("id", roundSetIds);
    if (deleteError) throw deleteError;
    const { error: plannedSetsError } = await supabase
      .from("session_exercises")
      .update({ planned_sets: setCounts[0] - 1 })
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .in("id", groupIds);
    if (plannedSetsError) throw plannedSetsError;
    return getSessionDetails(supabase, userId, sessionId);
  }

  const { data: allSets, error: setsError } = await supabase
    .from("session_sets")
    .select("id,set_number")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("session_exercise_id", sessionExerciseId)
    .order("set_number", { ascending: true });

  if (setsError) throw setsError;
  if ((allSets ?? []).length <= 1) {
    throw new Error("Each exercise must keep at least one set.");
  }

  const { error: deleteError } = await supabase
    .from("session_sets")
    .delete()
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", setId);

  if (deleteError) throw deleteError;

  const remainingSetIds = (allSets ?? [])
    .filter((set) => String(set.id) !== setId)
    .map((set) => String(set.id));
  const renumberUpdates = await Promise.all(
    remainingSetIds.map((id, index) =>
      supabase
        .from("session_sets")
        .update({ set_number: index + 1 })
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .eq("id", id),
    ),
  );
  const failedUpdate = renumberUpdates.find((result) => result.error);
  if (failedUpdate?.error) throw failedUpdate.error;

  const { error: plannedSetsError } = await supabase
    .from("session_exercises")
    .update({ planned_sets: remainingSetIds.length })
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("id", sessionExerciseId);

  if (plannedSetsError) throw plannedSetsError;
  return getSessionDetails(supabase, userId, sessionId);
}

async function validateExerciseOrder(
  supabase: SupabaseClient,
  table: "session_exercises" | "workout_suggestion_exercises",
  userId: string,
  sourceColumn: "session_id" | "suggestion_id",
  sourceId: string,
  exerciseIds: string[],
) {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .eq(sourceColumn, sourceId);

  if (error) throw error;

  const currentIds = new Set((data ?? []).map((exercise) => String(exercise.id)));
  if (
    currentIds.size !== exerciseIds.length ||
    exerciseIds.some((id) => !currentIds.has(id))
  ) {
    throw new Error("Exercise order does not match this workout.");
  }
}

async function updateExerciseOrder(
  supabase: SupabaseClient,
  table: "session_exercises" | "workout_suggestion_exercises",
  userId: string,
  sourceColumn: "session_id" | "suggestion_id",
  sourceId: string,
  exerciseIds: string[],
) {
  const updates = await Promise.all(
    exerciseIds.map((exerciseId, index) =>
      supabase
        .from(table)
        .update({ exercise_order: index + 1 })
        .eq("user_id", userId)
        .eq(sourceColumn, sourceId)
        .eq("id", exerciseId),
    ),
  );
  const failedUpdate = updates.find((result) => result.error);

  if (failedUpdate?.error) throw failedUpdate.error;
}

function normalizeTemplate(row: Record<string, unknown>): WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
} {
  return {
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
    workout_template_exercises: (
      (row.workout_template_exercises as Array<Record<string, unknown>>) ?? []
    )
      .map((exercise) => ({
        id: String(exercise.id),
        template_id: String(exercise.template_id),
        exercise_id: String(exercise.exercise_id),
        exercise_order: Number(exercise.exercise_order),
        target_sets: Number(exercise.target_sets),
        target_reps_min: Number(exercise.target_reps_min),
        target_reps_max: Number(exercise.target_reps_max),
        target_weight_kg: nullableNumber(exercise.target_weight_kg),
        target_set_weights_kg: nullableNumberArray(
          exercise.target_set_weights_kg,
        ),
        rest_seconds: Number(exercise.rest_seconds),
        superset_group_id: nullableString(exercise.superset_group_id),
        notes: nullableString(exercise.notes),
        exercise: normalizeExercise(exercise.exercise as Record<string, unknown>),
      }))
      .sort((a, b) => a.exercise_order - b.exercise_order),
  };
}

function normalizeSuggestion(row: Record<string, unknown>): WorkoutSuggestion & {
  workout_suggestion_exercises: Array<{
    id: string;
    exercise_order: number;
    exercise: Exercise;
  }>;
} {
  return {
    id: String(row.id),
    source_session_id: String(row.source_session_id),
    source_template_id: nullableString(row.source_template_id),
    name: String(row.name),
    rationale: nullableString(row.rationale),
    weekly_balance_notes: Array.isArray(row.weekly_balance_notes)
      ? row.weekly_balance_notes.map(String)
      : [],
    estimated_duration_minutes: nullableNumber(row.estimated_duration_minutes),
    target_session_type:
      row.target_session_type === "weekday" || row.target_session_type === "sunday"
        ? row.target_session_type
        : null,
    status: row.status as WorkoutSuggestion["status"],
    workout_suggestion_exercises: (
      (row.workout_suggestion_exercises as Array<Record<string, unknown>>) ?? []
    )
      .map((exercise) => ({
        id: String(exercise.id),
        exercise_order: Number(exercise.exercise_order),
        exercise: normalizeExercise(exercise.exercise as Record<string, unknown>),
      }))
      .sort((a, b) => a.exercise_order - b.exercise_order),
  };
}

function normalizeSession(row: Record<string, unknown>): WorkoutSession {
  return {
    id: String(row.id),
    template_id: nullableString(row.template_id),
    source_suggestion_id: nullableString(row.source_suggestion_id),
    name: String(row.name),
    status: row.status as WorkoutSession["status"],
    performed_at: String(row.performed_at),
    started_at: String(row.started_at),
    finished_at: nullableString(row.finished_at),
    notes: nullableString(row.notes),
  };
}

function normalizeSessionDetails(row: Record<string, unknown>): SessionWithDetails {
  return {
    ...normalizeSession(row),
    session_exercises: (
      (row.session_exercises as Array<Record<string, unknown>>) ?? []
    )
      .map((exercise) => ({
        id: String(exercise.id),
        session_id: String(exercise.session_id),
        exercise_id: String(exercise.exercise_id),
        exercise_order: Number(exercise.exercise_order),
        planned_sets: Number(exercise.planned_sets),
        target_reps_min: Number(exercise.target_reps_min),
        target_reps_max: Number(exercise.target_reps_max),
        target_weight_kg: nullableNumber(exercise.target_weight_kg),
        rest_seconds: Number(exercise.rest_seconds),
        superset_group_id: nullableString(exercise.superset_group_id),
        notes: nullableString(exercise.notes),
        exercise: normalizeExercise(exercise.exercise as Record<string, unknown>),
        session_sets: (
          (exercise.session_sets as Array<Record<string, unknown>>) ?? []
        )
          .map(normalizeSet)
          .sort((a, b) => a.set_number - b.set_number),
      }))
      .sort((a, b) => a.exercise_order - b.exercise_order),
  };
}

function normalizeExercise(row: Record<string, unknown>): Exercise {
  return {
    id: String(row.id),
    name: String(row.name),
    primary_muscle_group: String(row.primary_muscle_group),
    secondary_muscle_groups: Array.isArray(row.secondary_muscle_groups)
      ? row.secondary_muscle_groups.map(String)
      : [],
    equipment: nullableString(row.equipment),
    lift_category: row.lift_category as Exercise["lift_category"],
    default_increment_kg: Number(row.default_increment_kg),
    is_main_lift: Boolean(row.is_main_lift),
    is_ai_suggestion_enabled: Boolean(row.is_ai_suggestion_enabled),
    volume_multiplier: Number(row.volume_multiplier) === 2 ? 2 : 1,
    notes: nullableString(row.notes),
  };
}

function normalizeSet(row: Record<string, unknown>): SessionSet {
  return {
    id: String(row.id),
    session_exercise_id: String(row.session_exercise_id),
    set_number: Number(row.set_number),
    weight_kg: Number(row.weight_kg),
    reps: Number(row.reps),
    rpe: nullableNumber(row.rpe),
    completed: Boolean(row.completed),
    note: nullableString(row.note),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableNumberArray(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return value.map(nullableNumber);
}
