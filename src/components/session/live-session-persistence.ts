import type { SessionWithDetails } from "@/lib/domain";

export const LIVE_SESSION_BACKUP_VERSION = 1;

export type LiveSessionSyncPayload = {
  performedAt: string;
  notes: string | null;
  exercises: Array<{
    id: string;
    exerciseId: string;
    exerciseOrder: number;
    targetRepsMin: number;
    targetRepsMax: number;
    targetWeightKg: number | null;
    restSeconds: number;
    supersetGroupId: string | null;
    notes: string | null;
    sets: Array<{
      id: string;
      setNumber: number;
      weightKg: number;
      reps: number;
      rpe: number | null;
      completed: boolean;
      note: string | null;
    }>;
  }>;
};

export type LiveSessionBackup = {
  version: typeof LIVE_SESSION_BACKUP_VERSION;
  sessionId: string;
  savedAt: string;
  revision: number;
  draft: SessionWithDetails;
  performedAt: string;
  notes: string;
};

export function liveSessionBackupKey(sessionId: string) {
  return `nextset.live-session.v${LIVE_SESSION_BACKUP_VERSION}:${sessionId}`;
}

export function buildLiveSessionSyncPayload(
  draft: SessionWithDetails,
  performedAt: string,
  notes: string,
): LiveSessionSyncPayload {
  return {
    performedAt: new Date(performedAt).toISOString(),
    notes: notes.trim() || null,
    exercises: draft.session_exercises.map((exercise, exerciseIndex) => ({
      id: exercise.id,
      exerciseId: exercise.exercise_id,
      exerciseOrder: exerciseIndex + 1,
      targetRepsMin: exercise.target_reps_min,
      targetRepsMax: exercise.target_reps_max,
      targetWeightKg: exercise.target_weight_kg,
      restSeconds: exercise.rest_seconds,
      supersetGroupId: exercise.superset_group_id ?? null,
      notes: exercise.notes,
      sets: exercise.session_sets.map((set, setIndex) => ({
        id: set.id,
        setNumber: setIndex + 1,
        weightKg: set.weight_kg,
        reps: set.reps,
        rpe: set.rpe,
        completed: set.completed,
        note: set.note,
      })),
    })),
  };
}

export function createLiveSessionBackup(
  draft: SessionWithDetails,
  performedAt: string,
  notes: string,
  revision: number,
): LiveSessionBackup {
  return {
    version: LIVE_SESSION_BACKUP_VERSION,
    sessionId: draft.id,
    savedAt: new Date().toISOString(),
    revision,
    draft,
    performedAt,
    notes,
  };
}

export function parseLiveSessionBackup(
  serialized: string | null,
  expectedSessionId: string,
): LiveSessionBackup | null {
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Partial<LiveSessionBackup>;
    if (
      value.version !== LIVE_SESSION_BACKUP_VERSION ||
      value.sessionId !== expectedSessionId ||
      typeof value.savedAt !== "string" ||
      !Number.isInteger(value.revision) ||
      typeof value.performedAt !== "string" ||
      typeof value.notes !== "string" ||
      !isSessionDraft(value.draft, expectedSessionId)
    ) {
      return null;
    }

    return value as LiveSessionBackup;
  } catch {
    return null;
  }
}

function isSessionDraft(
  value: unknown,
  expectedSessionId: string,
): value is SessionWithDetails {
  if (!isRecord(value) || value.id !== expectedSessionId) return false;
  if (!Array.isArray(value.session_exercises)) return false;

  return value.session_exercises.every((exercise) => {
    if (
      !isRecord(exercise) ||
      typeof exercise.id !== "string" ||
      typeof exercise.exercise_id !== "string" ||
      !isRecord(exercise.exercise) ||
      typeof exercise.exercise.name !== "string" ||
      !Array.isArray(exercise.session_sets)
    ) {
      return false;
    }

    return exercise.session_sets.every(
      (set) =>
        isRecord(set) &&
        typeof set.id === "string" &&
        typeof set.session_exercise_id === "string" &&
        typeof set.set_number === "number" &&
        typeof set.weight_kg === "number" &&
        typeof set.reps === "number" &&
        typeof set.completed === "boolean",
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
