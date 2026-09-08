"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LogOut,
  Link2,
  MessageSquare,
  Plus,
  Save,
  Search,
  Square,
  Trash2,
  Trophy,
  Unlink,
  X,
} from "lucide-react";

import {
  AppLink,
  useAppActivity,
  useTrackedRouter,
} from "@/components/ui/app-activity";
import {
  ExerciseReplacementPicker,
  type ReplacementCandidate,
} from "@/components/exercises/exercise-replacement-picker";
import { ReadOnlySession } from "@/components/session/read-only-session";
import {
  getIncompleteSessionSummary,
  isSessionExerciseComplete,
  type IncompleteSessionSummary,
} from "@/components/session/session-completion";
import {
  buildLiveSessionSyncPayload,
  createLiveSessionBackup,
  liveSessionBackupKey,
  parseLiveSessionBackup,
} from "@/components/session/live-session-persistence";
import {
  LIVE_EXERCISE_STICKY_HEADER_CLASS_NAME,
  LIVE_SESSION_ROOT_CLASS_NAME,
  LIVE_SESSION_STICKY_FOOTER_CLASS_NAME,
  LIVE_SESSION_STICKY_HEADER_CLASS_NAME,
} from "@/components/session/session-layout-contract";
import { Button } from "@/components/ui/button";
import { PlateCalculatorButton } from "@/components/ui/plate-calculator";
import { SortableList } from "@/components/ui/sortable-list";
import type { Exercise, SessionSet, SessionWithDetails } from "@/lib/domain";
import { buildSupersetBlocks, shouldStartRestTimer, type SupersetBlock } from "@/lib/supersets";
import { sessionVolume } from "@/lib/workout-metrics";

type RestTimer = {
  exerciseName: string;
  seconds: number;
  endAt: number;
  visible: boolean;
};

const RPE_MIN = 5;
const RPE_MAX = 10;
const RPE_STEP = 0.5;
const DEFAULT_RPE = 6;
const AUTOSAVE_DELAY_MS = 600;
const AUTOSAVE_RETRY_MS = 4000;
const RPE_OPTIONS = Array.from(
  { length: (RPE_MAX - RPE_MIN) / RPE_STEP + 1 },
  (_, index) => RPE_MIN + index * RPE_STEP,
);

export function SessionLogger({
  session,
  exercises,
  readOnly = false,
}: {
  session: SessionWithDetails;
  exercises: Exercise[];
  readOnly?: boolean;
}) {
  const router = useTrackedRouter();
  const { fetchWithActivity } = useAppActivity();
  const [draft, setDraft] = useState(session);
  const draftRef = useRef(session);
  const backgroundSyncRef = useRef<Promise<void>>(Promise.resolve());
  const notesRef = useRef(session.notes ?? "");
  const performedAtRef = useRef(toLocalInputValue(session.performed_at));
  const revisionRef = useRef(0);
  const syncedRevisionRef = useRef(0);
  const syncRequestRef = useRef<Promise<boolean> | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceReadyRef = useRef(false);
  const interactionLockRef = useRef(false);
  const [exerciseToAddId, setExerciseToAddId] = useState(exercises[0]?.id ?? "");
  const [exerciseAdded, setExerciseAdded] = useState(false);
  const exerciseAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [notes, setNotes] = useState(session.notes ?? "");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [performedAt, setPerformedAt] = useState(
    toLocalInputValue(session.performed_at),
  );
  const [saving, setSaving] = useState(false);
  const syncingStructureRef = useRef(false);
  const [syncingStructure, setSyncingStructure] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "saved" | "pending" | "saving" | "local" | "error"
  >("saved");
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  const [persistenceHydrated, setPersistenceHydrated] = useState(readOnly);
  const [finishing, setFinishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restTimer, setRestTimer] = useState<RestTimer | null>(null);
  const [restTimerRemainingSeconds, setRestTimerRemainingSeconds] = useState(0);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [isExitOpen, setIsExitOpen] = useState(false);
  const [expandedCompletedExerciseIds, setExpandedCompletedExerciseIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const [isIncompleteFinishOpen, setIsIncompleteFinishOpen] = useState(false);
  const filteredExercises = useMemo(() => {
    const query = exerciseFilter.trim().toLowerCase();

    return query
      ? exercises.filter((exercise) =>
          exercise.name.toLowerCase().includes(query),
        )
      : exercises;
  }, [exerciseFilter, exercises]);
  const selectedExerciseToAddId =
    filteredExercises.find((exercise) => exercise.id === exerciseToAddId)?.id ??
    filteredExercises[0]?.id ??
    "";

  const sessionStats = useMemo(
    () => getSessionStats(draft, elapsedNow),
    [draft, elapsedNow],
  );
  const incompleteSessionSummary = useMemo(
    () => getIncompleteSessionSummary(draft.session_exercises),
    [draft.session_exercises],
  );
  const exerciseBlocks = buildSupersetBlocks(
    draft.session_exercises,
    (exercise) => exercise.superset_group_id,
  );
  const scheduleAutosaveEffect = useEffectEvent((delay?: number) => {
    scheduleAutosave(delay);
  });
  const persistLocalBackupEffect = useEffectEvent(() => {
    persistLocalBackup();
  });

  useEffect(() => {
    if (readOnly) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      persistenceReadyRef.current = true;
      const key = liveSessionBackupKey(session.id);
      const backup = parseLiveSessionBackup(
        window.localStorage.getItem(key),
        session.id,
      );

      if (backup && session.status !== "cancelled") {
        draftRef.current = backup.draft;
        notesRef.current = backup.notes;
        performedAtRef.current = backup.performedAt;
        revisionRef.current = Math.max(1, backup.revision);
        syncedRevisionRef.current = 0;
        setDraft(backup.draft);
        setNotes(backup.notes);
        setPerformedAt(backup.performedAt);
        setRecoveredDraft(true);
        setSyncStatus(navigator.onLine ? "pending" : "local");
        scheduleAutosaveEffect(100);
      } else if (window.localStorage.getItem(key)) {
        window.localStorage.removeItem(key);
      }
      setPersistenceHydrated(true);
    });

    return () => {
      cancelled = true;
      persistenceReadyRef.current = false;
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [readOnly, session.id, session.status]);

  useEffect(() => {
    function handleOnline() {
      if (revisionRef.current > syncedRevisionRef.current) {
        setSyncStatus("pending");
        scheduleAutosaveEffect(0);
      }
    }

    function handleOffline() {
      if (revisionRef.current > syncedRevisionRef.current) {
        setSyncStatus("local");
      }
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (revisionRef.current <= syncedRevisionRef.current) return;
      persistLocalBackupEffect();
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePageHide() {
      if (revisionRef.current <= syncedRevisionRef.current) return;
      persistLocalBackupEffect();
      if (!syncRequestRef.current && navigator.onLine) {
        void fetch(`/api/sessions/${session.id}/sync`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildLiveSessionSyncPayload(
              draftRef.current,
              performedAtRef.current,
              notesRef.current,
            ),
          ),
          keepalive: true,
        });
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [session.id]);

  useEffect(() => {
    return () => {
      if (exerciseAddedTimeoutRef.current) {
        clearTimeout(exerciseAddedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setElapsedNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!restTimer?.visible) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((restTimer.endAt - Date.now()) / 1000),
      );
      setRestTimerRemainingSeconds(remaining);
      if (remaining <= 0) {
        setRestTimer(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [restTimer?.endAt, restTimer?.visible]);

  async function saveChanges() {
    if (interactionLockRef.current) return false;
    interactionLockRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      persistLocalBackup();
      return await flushPendingChanges(true);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to save this workout. Your changes remain on this device.",
      );
      return false;
    } finally {
      interactionLockRef.current = false;
      setSaving(false);
    }
  }

  async function finish() {
    if (
      interactionLockRef.current ||
      draftRef.current.session_exercises.length === 0
    ) {
      return;
    }

    interactionLockRef.current = true;
    setFinishing(true);
    setActionError(null);
    try {
      persistLocalBackup();
      if (!(await flushPendingChanges(true))) return;
      const response = await fetchWithActivity(
        "Finishing workout...",
        `/api/sessions/${session.id}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            performedAt: toIsoFromLocalInput(performedAtRef.current),
            notes: notesRef.current.trim() || null,
          }),
        },
      );
      if (!response.ok) throw new Error(await responseErrorMessage(response));
      clearLocalBackup();
      router.push(`/sessions/${session.id}/review`);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to finish this workout. Please try again.",
      );
    } finally {
      interactionLockRef.current = false;
      setFinishing(false);
    }
  }

  function requestFinish() {
    const summary = getIncompleteSessionSummary(
      draftRef.current.session_exercises,
    );

    if (summary.incompleteExerciseNames.length > 0) {
      setIsIncompleteFinishOpen(true);
      return;
    }

    void finish();
  }

  function toggleCompletedExercise(sessionExerciseId: string) {
    setExpandedCompletedExerciseIds((current) => {
      const next = new Set(current);

      if (next.has(sessionExerciseId)) {
        next.delete(sessionExerciseId);
      } else {
        next.add(sessionExerciseId);
      }

      return next;
    });
  }

  async function cancel() {
    const confirmed = window.confirm(
      "Cancel this workout? This discards the session and any logged changes.",
    );
    if (!confirmed) return;

    interactionLockRef.current = true;
    setCancelling(true);
    setCancelError(null);
    try {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      await syncRequestRef.current;
      const response = await fetchWithActivity(
        "Cancelling workout...",
        `/api/sessions/${session.id}/cancel`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Cancel request failed.");
      }

      clearLocalBackup();
      router.replace("/history");
    } catch {
      setCancelError("Unable to cancel this workout. Please try again.");
    } finally {
      interactionLockRef.current = false;
      setCancelling(false);
    }
  }

  async function exitWithSave() {
    if (await saveChanges()) {
      router.push("/history");
    }
  }

  function exitWithoutSaving() {
    const confirmed = window.confirm(
      "Leave now? Any change still waiting to sync will remain safely stored on this device.",
    );
    if (confirmed) {
      persistLocalBackup();
      router.push("/history");
    }
  }

  if (readOnly) {
    return <ReadOnlySession session={session} />;
  }

  if (!persistenceHydrated) {
    return (
      <p className="rounded-2xl bg-white p-5 text-center text-sm font-medium text-slate-600">
        Restoring workout…
      </p>
    );
  }

  return (
    <div className={LIVE_SESSION_ROOT_CLASS_NAME}>
      <section className={LIVE_SESSION_STICKY_HEADER_CLASS_NAME}>
        <div className="mx-auto max-w-6xl">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <h1 className="truncate text-sm font-bold leading-6">
                  {session.name}
                </h1>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 py-0.5 pl-1.5 pr-2 text-[10px] font-extrabold uppercase tracking-wider text-white">
                  {session.status === "active" ? (
                    <span
                      aria-hidden="true"
                      className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-white"
                    />
                  ) : null}
                  {session.status}
                </span>
              </div>
            </div>
            <PlateCalculatorButton
              className="shrink-0 border-emerald-200 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300"
              compact
            />
            <label className="relative flex min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2 pr-2.5 text-slate-500">
              <span className="sr-only">Workout date and time</span>
              <CalendarDays className="shrink-0" size={12} />
              <span className="block whitespace-nowrap text-[10px] font-semibold leading-4 text-slate-700">
                {formatDateTimeInputLabel(performedAt)}
              </span>
              <input
                aria-label="Workout date and time"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                disabled={saving || finishing || cancelling}
                type="datetime-local"
                value={performedAt}
                onChange={(event) => {
                  if (interactionLockRef.current) return;
                  performedAtRef.current = event.target.value;
                  setPerformedAt(event.target.value);
                  markSessionDirty();
                }}
              />
            </label>
          </div>
          {session.status === "active" ? (
            <div className="mt-1 grid grid-cols-4 items-center gap-x-2 whitespace-nowrap leading-4">
              <SessionStat
                label="Vol"
                value={`${formatStatNumber(sessionStats.totalVolumeKg)}kg`}
              />
              <SessionStat
                label="Sets"
                value={`${sessionStats.completedSets}/${sessionStats.preparedSets}`}
              />
              <SessionStat
                label="Time"
                value={formatDuration(sessionStats.elapsedSeconds)}
              />
              <SessionStat
                label="Exes"
                value={String(sessionStats.exerciseCount)}
              />
            </div>
          ) : null}
        </div>
      </section>

      {draft.session_exercises.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-medium text-slate-600">
          No exercises yet. Add one below to begin logging.
        </p>
      ) : null}

      <SortableList
        disabled={saving || cancelling || finishing}
        getLabel={(block) => block.items.map((item) => item.exercise.name).join(" and ")}
        items={exerciseBlocks}
        onReorder={(blocks) => void reorderExercises(blocks.flatMap((block) => block.items))}
        renderItem={(block, handle, compact) => {
          if (block.groupId) return renderSupersetBlock(block, handle, compact);
          const exercise = block.items[0];
          if (compact) {
            return (
              <div className="flex h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-lg">
                {handle}
                <span className="truncate font-bold">{exercise.exercise.name}</span>
              </div>
            );
          }

          const isComplete = isSessionExerciseComplete(exercise);
          const isExpanded =
            !isComplete || expandedCompletedExerciseIds.has(exercise.id);

          if (!isExpanded) {
            return (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-1.5 shadow-sm">
                <div className="flex min-w-0 items-center gap-1">
                  {handle}
                  <button
                    aria-expanded="false"
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left transition hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40"
                    onClick={() => toggleCompletedExercise(exercise.id)}
                    type="button"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check size={14} strokeWidth={3.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                        {exercise.exercise.name}
                      </span>
                      <span className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {exercise.session_sets.length}/
                        {exercise.session_sets.length} sets done
                      </span>
                    </span>
                    <ChevronDown
                      className="shrink-0 text-emerald-700 dark:text-emerald-300"
                      size={18}
                    />
                  </button>
                </div>
              </section>
            );
          }

          return (
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className={LIVE_EXERCISE_STICKY_HEADER_CLASS_NAME}>
                <div className="flex min-w-0 flex-1 items-start gap-1">
                  {handle}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-bold leading-6">
                      {exercise.exercise.name}
                    </h2>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 leading-4">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {exercise.exercise.primary_muscle_group}
                      </span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-500">
                        {exercise.planned_sets}×{exercise.target_reps_min}
                        -{exercise.target_reps_max}
                        {exercise.target_weight_kg !== null
                          ? ` @ ${exercise.target_weight_kg}kg`
                          : ""}
                      </span>
                      <label
                        className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        title="Count the entered weight twice for volume in all sessions. Strength records and progression still use the entered weight."
                      >
                        <input
                          checked={exercise.exercise.volume_multiplier === 2}
                          className="h-3.5 w-3.5"
                          disabled={
                            saving ||
                            syncingStructure ||
                            finishing ||
                            cancelling
                          }
                          onChange={() =>
                            toggleExerciseVolumeMultiplier(
                              exercise.exercise_id,
                              exercise.exercise.volume_multiplier,
                            )
                          }
                          type="checkbox"
                        />
                        <span>2x</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {isComplete ? (
                    <Button
                      aria-expanded="true"
                      aria-label={`Fold ${exercise.exercise.name}`}
                      className="min-h-9 px-2.5"
                      disabled={saving || finishing || cancelling}
                      onClick={() => toggleCompletedExercise(exercise.id)}
                      variant="ghost"
                    >
                      <ChevronUp size={17} />
                    </Button>
                  ) : null}
                  <Button
                    aria-label={`Remove ${exercise.exercise.name}`}
                    className="min-h-9 px-2.5"
                    disabled={
                      saving || finishing || cancelling
                    }
                    onClick={() => removeExercise(exercise.id)}
                    variant="ghost"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
              <ExerciseReplacementPicker
                contextType="session"
                currentTarget={{
                  sets: exercise.planned_sets,
                  repsMin: exercise.target_reps_min,
                  repsMax: exercise.target_reps_max,
                  weightKg: exercise.target_weight_kg,
                  restSeconds: exercise.rest_seconds,
                  notes: exercise.notes,
                }}
                disabled={saving || finishing || cancelling}
                excludeExerciseIds={draft.session_exercises.map(
                  (item) => item.exercise_id,
                )}
                sourceExerciseId={exercise.exercise_id}
                onChoose={(candidate) => replaceExercise(exercise.id, candidate)}
              />
              <div className="grid grid-cols-[1.4rem_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_2.75rem_1.75rem_1.75rem] items-center gap-1 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <span className="text-center">#</span>
                <span>
                  {exercise.exercise.volume_multiplier === 2
                    ? "kg each"
                    : "kg"}
                </span>
                <span>Reps</span>
                <span>RPE</span>
                <span className="text-center">Done</span>
                <span className="sr-only">Note</span>
                <span className="sr-only">Remove</span>
              </div>
              <div className="space-y-1.5">
                {exercise.session_sets.map((set) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    canRemove={exercise.session_sets.length > 1}
                    disabled={saving || finishing || cancelling}
                    removeDisabled={false}
                    onChange={(nextSet) => updateSet(exercise.id, nextSet)}
                    onCompleted={() =>
                      maybeStartRestTimer(exercise, set.set_number)
                    }
                    onRemove={() => removeSet(set.id)}
                  />
                ))}
              </div>
              <Button
                className="mt-2 h-11 w-full border-dashed"
                disabled={
                  saving ||
                  finishing ||
                  cancelling ||
                  exercise.session_sets.length >= 12
                }
                onClick={() => addSet(exercise.id)}
                variant="secondary"
              >
                <Plus size={16} />
                Add set
              </Button>
              {renderPairButton(exercise)}
            </section>
          );
        }}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          aria-expanded={isNotesOpen}
          className="flex w-full items-center justify-between px-1 py-1 text-left text-sm font-bold text-slate-700"
          onClick={() => setIsNotesOpen((isOpen) => !isOpen)}
          type="button"
        >
          <span>Session notes</span>
          {isNotesOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {isNotesOpen ? (
          <label className="mt-2 block">
            <span className="sr-only">Session notes</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
              disabled={saving || finishing || cancelling}
              placeholder="Optional note"
              value={notes}
              onChange={(event) => {
                if (interactionLockRef.current) return;
                notesRef.current = event.target.value;
                setNotes(event.target.value);
                markSessionDirty();
              }}
            />
          </label>
        ) : notes.trim() ? (
          <p className="mt-1 truncate px-1 text-sm text-slate-500">{notes}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="relative block">
          <span className="sr-only">Filter exercises</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-11 text-sm"
            placeholder="Search exercises to add"
            type="search"
            value={exerciseFilter}
            onChange={(event) => setExerciseFilter(event.target.value)}
          />
          {exerciseFilter ? (
            <button
              aria-label="Clear exercise filter"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-900"
              onClick={() => setExerciseFilter("")}
              type="button"
            >
              <X size={17} />
            </button>
          ) : null}
        </label>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <select
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-medium"
            disabled={filteredExercises.length === 0}
            value={selectedExerciseToAddId}
            onChange={(event) => setExerciseToAddId(event.target.value)}
          >
            {filteredExercises.length === 0 ? (
              <option value="">No matching exercises</option>
            ) : (
              filteredExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))
            )}
          </select>
          <Button
            aria-label={exerciseAdded ? "Exercise added" : "Add exercise"}
            onClick={addExercise}
            disabled={
              !selectedExerciseToAddId ||
              saving ||
              finishing ||
              cancelling
            }
            className="h-11 w-11 px-0"
          >
            {exerciseAdded ? <Check size={18} /> : <Plus size={18} />}
          </Button>
        </div>
      </section>

      {cancelError ? (
        <p
          className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700"
          role="alert"
        >
          {cancelError}
        </p>
      ) : null}
      {syncingStructure ? (
        <p
          className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
          role="status"
        >
          Updating the exercise volume setting...
        </p>
      ) : null}
      {recoveredDraft ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800" role="status">
          Restored your latest workout changes from this device. They will sync automatically.
        </p>
      ) : null}
      {actionError ? (
        <p
          className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      <div className={LIVE_SESSION_STICKY_FOOTER_CLASS_NAME}>
        <p
          className={`mb-2 text-center text-[11px] font-bold ${
            syncStatus === "error" || syncStatus === "local"
              ? "text-amber-700"
              : "text-slate-500"
          }`}
          role="status"
        >
          {syncStatusLabel(syncStatus)}
        </p>
        {restTimer?.visible ? (
          <RestTimerBanner
            exerciseName={restTimer.exerciseName}
            remainingSeconds={restTimerRemainingSeconds}
            totalSeconds={restTimer.seconds}
            onDismiss={() =>
              setRestTimer((timer) =>
                timer ? { ...timer, visible: false } : timer,
              )
            }
            onSkip={() => setRestTimer(null)}
          />
        ) : null}
        {session.status === "active" ? (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                className="h-12 px-2"
                onClick={saveChanges}
                disabled={saving || finishing || cancelling}
                type="button"
                variant="secondary"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                className="h-12 px-2"
                onClick={requestFinish}
                disabled={
                  finishing ||
                  cancelling ||
                  saving ||
                  draft.session_exercises.length === 0
                }
                type="button"
              >
                <Trophy size={16} />
                {finishing ? "Finishing..." : "Finish"}
              </Button>
              <div className="relative">
                <Button
                  className="h-12 w-full px-2"
                  onClick={() => setIsExitOpen((isOpen) => !isOpen)}
                  disabled={
                    saving || finishing || cancelling
                  }
                  type="button"
                  variant="secondary"
                >
                  <LogOut size={16} />
                  Exit
                </Button>
                {isExitOpen ? (
                  <div className="absolute bottom-full right-0 mb-2 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 text-sm shadow-2xl">
                    <button
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => void exitWithSave()}
                      type="button"
                    >
                      <Save size={15} />
                      Save and exit
                    </button>
                    <button
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={exitWithoutSaving}
                      type="button"
                    >
                      <LogOut size={15} />
                      Exit only
                    </button>
                    <button
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-rose-700 hover:bg-rose-50"
                      onClick={cancel}
                      type="button"
                    >
                      <Trash2 size={15} />
                      Cancel workout
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-12"
              onClick={saveChanges}
              disabled={saving || finishing || cancelling}
              type="button"
              variant="secondary"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save changes"}
            </Button>
            <AppLink
              className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
              href={`/sessions/${session.id}/review`}
            >
              View AI review
            </AppLink>
          </div>
        )}
      </div>
      {isIncompleteFinishOpen
        ? createPortal(
            <IncompleteFinishDialog
              summary={incompleteSessionSummary}
              onBack={() => setIsIncompleteFinishOpen(false)}
              onConfirm={() => {
                setIsIncompleteFinishOpen(false);
                void finish();
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );

  function renderSupersetBlock(
    block: SupersetBlock<SessionWithDetails["session_exercises"][number]>,
    handle: ReactNode,
    compact: boolean,
  ) {
    const [first, second] = block.items;
    if (compact) {
      return (
        <div className="flex h-14 items-center gap-2 rounded-2xl border border-emerald-300 bg-white px-3 shadow-lg">
          {handle}
          <span className="truncate font-bold">{first.exercise.name} + {second.exercise.name}</span>
        </div>
      );
    }
    const isComplete = block.items.every(isSessionExerciseComplete);
    const isExpanded = block.items.some((exercise) =>
      expandedCompletedExerciseIds.has(exercise.id),
    );
    if (isComplete && !isExpanded) {
      return (
        <section className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-1.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-1">
            {handle}
            <button
              aria-expanded="false"
              className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left"
              onClick={() => toggleSupersetBlock(block.items)}
              type="button"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={14} strokeWidth={3.5} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{first.exercise.name} + {second.exercise.name}</span>
                <span className="block text-[11px] font-semibold text-emerald-700">{first.session_sets.length} superset rounds done</span>
              </span>
              <ChevronDown className="text-emerald-700" size={18} />
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-emerald-300 bg-white p-3 shadow-sm">
        <div className={LIVE_EXERCISE_STICKY_HEADER_CLASS_NAME}>
          <div className="flex min-w-0 flex-1 items-start gap-1">
            {handle}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">Superset · {first.session_sets.length} rounds</p>
              <h2 className="truncate text-[15px] font-bold">{first.exercise.name} + {second.exercise.name}</h2>
              <p className="text-[11px] font-semibold text-slate-500">Rest {first.rest_seconds}s after each round</p>
            </div>
          </div>
          <div className="flex items-center">
            {isComplete ? (
              <Button aria-label="Fold superset" className="min-h-9 px-2.5" onClick={() => toggleSupersetBlock(block.items)} variant="ghost"><ChevronUp size={17} /></Button>
            ) : null}
            <Button aria-label="Remove superset" className="min-h-9 px-2.5" disabled={saving || finishing || cancelling} onClick={() => removeLiveSuperset(block.groupId as string)} variant="ghost"><Unlink size={16} /></Button>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {block.items.map((exercise, index) => (
            <div className="rounded-xl border border-emerald-100 p-2" key={exercise.id}>
              <p className="mb-1 text-xs font-bold"><span className="mr-1 text-emerald-700">{index === 0 ? "A" : "B"}</span>{exercise.exercise.name}</p>
              <ExerciseReplacementPicker
                contextType="session"
                currentTarget={{
                  sets: exercise.planned_sets,
                  repsMin: exercise.target_reps_min,
                  repsMax: exercise.target_reps_max,
                  weightKg: exercise.target_weight_kg,
                  restSeconds: exercise.rest_seconds,
                  notes: exercise.notes,
                }}
                disabled={saving || finishing || cancelling}
                excludeExerciseIds={draft.session_exercises.map((item) => item.exercise_id)}
                sourceExerciseId={exercise.exercise_id}
                onChoose={(candidate) => replaceExercise(exercise.id, candidate)}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-3">
          {Array.from({ length: first.session_sets.length }, (_, roundIndex) => (
            <div className="rounded-xl bg-emerald-50/60 p-2" key={roundIndex}>
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">Round {roundIndex + 1}</p>
              {[first, second].map((exercise, exerciseIndex) => {
                const set = exercise.session_sets[roundIndex];
                return (
                  <div className="mb-2 last:mb-0" key={exercise.id}>
                    <div className="mb-1 flex items-center gap-2 px-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-extrabold text-white">{exerciseIndex === 0 ? "A" : "B"}</span>
                      <span className="truncate text-xs font-bold">{exercise.exercise.name}</span>
                    </div>
                    <SetRow
                      set={set}
                      canRemove={false}
                      disabled={saving || finishing || cancelling}
                      removeDisabled
                      onChange={(nextSet) => updateSet(exercise.id, nextSet)}
                      onCompleted={() => maybeStartRestTimer(exercise, set.set_number)}
                      onRemove={() => undefined}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button disabled={saving || finishing || cancelling || first.session_sets.length >= 12} onClick={() => addSet(first.id)} variant="secondary">
            <Plus size={16} /> Add round
          </Button>
          <Button disabled={saving || finishing || cancelling || first.session_sets.length <= 1} onClick={() => removeSupersetRound(block.groupId as string)} variant="ghost">
            <Trash2 size={16} /> Last round
          </Button>
        </div>
      </section>
    );
  }

  function renderPairButton(exercise: SessionWithDetails["session_exercises"][number]) {
    const index = draft.session_exercises.findIndex((item) => item.id === exercise.id);
    const next = draft.session_exercises[index + 1];
    if (!next || next.superset_group_id || next.session_sets.length !== exercise.session_sets.length) return null;
    return (
      <Button className="mt-2 h-11 w-full" disabled={saving || finishing || cancelling} onClick={() => createLiveSuperset(index)} variant="secondary">
        <Link2 size={16} /> Superset with next
      </Button>
    );
  }

  function toggleSupersetBlock(
    exercises: SessionWithDetails["session_exercises"],
  ) {
    setExpandedCompletedExerciseIds((current) => {
      const next = new Set(current);
      const shouldExpand = exercises.some((exercise) => !next.has(exercise.id));
      exercises.forEach((exercise) => {
        if (shouldExpand) next.add(exercise.id);
        else next.delete(exercise.id);
      });
      return next;
    });
  }

  function addExercise() {
    if (interactionLockRef.current) return;
    if (!selectedExerciseToAddId) return;
    const exercise = exercises.find((item) => item.id === selectedExerciseToAddId);
    if (!exercise) return;

    const sessionExerciseId = crypto.randomUUID();
    const initialSetId = crypto.randomUUID();
    const optimisticExercise: SessionWithDetails["session_exercises"][number] = {
      id: sessionExerciseId,
      session_id: session.id,
      exercise_id: exercise.id,
      exercise_order: draftRef.current.session_exercises.length + 1,
      planned_sets: 1,
      target_reps_min: 8,
      target_reps_max: 12,
      target_weight_kg: 0,
      rest_seconds: 90,
      superset_group_id: null,
      notes: null,
      exercise,
      session_sets: [
        {
          id: initialSetId,
          session_exercise_id: sessionExerciseId,
          set_number: 1,
          weight_kg: 0,
          reps: 0,
          rpe: null,
          completed: false,
          note: null,
        },
      ],
    };

    mutateDraft((current) => ({
      ...current,
      session_exercises: orderExercises([
        ...current.session_exercises,
        optimisticExercise,
      ]),
    }));
    flashExerciseAdded();
  }

  function flashExerciseAdded() {
    setExerciseAdded(true);
    if (exerciseAddedTimeoutRef.current) {
      clearTimeout(exerciseAddedTimeoutRef.current);
    }
    exerciseAddedTimeoutRef.current = setTimeout(() => {
      setExerciseAdded(false);
      exerciseAddedTimeoutRef.current = null;
    }, 2000);
  }

  function removeExercise(sessionExerciseId: string) {
    if (interactionLockRef.current) return;
    const removedExercise = draftRef.current.session_exercises.find(
      (exercise) => exercise.id === sessionExerciseId,
    );
    if (!removedExercise) return;

    mutateDraft((current) => ({
      ...current,
      session_exercises: orderExercises(
        current.session_exercises
          .filter((exercise) => exercise.id !== sessionExerciseId)
          .map((exercise) =>
            removedExercise.superset_group_id &&
            exercise.superset_group_id === removedExercise.superset_group_id
              ? { ...exercise, superset_group_id: null }
              : exercise,
        ),
      ),
    }));
  }

  function addSet(sessionExerciseId: string) {
    if (interactionLockRef.current) return;
    const sessionExercise = draftRef.current.session_exercises.find(
      (exercise) => exercise.id === sessionExerciseId,
    );
    if (!sessionExercise || sessionExercise.session_sets.length >= 12) return;
    if (sessionExercise.superset_group_id) {
      const group = draftRef.current.session_exercises.filter(
        (exercise) =>
          exercise.superset_group_id === sessionExercise.superset_group_id,
      );
      if (group.length !== 2 || group.some((exercise) => exercise.session_sets.length >= 12)) return;
      addSupersetRound(group);
      return;
    }
    addSingleSet(sessionExerciseId);
  }

  function addSingleSet(sessionExerciseId: string) {
    if (interactionLockRef.current) return;
    const sessionExercise = draftRef.current.session_exercises.find(
      (exercise) => exercise.id === sessionExerciseId,
    );
    if (!sessionExercise || sessionExercise.session_sets.length >= 12) return;
    const lastSet = sessionExercise.session_sets.at(-1);
    const setId = crypto.randomUUID();
    const optimisticSet: SessionSet = {
      id: setId,
      session_exercise_id: sessionExerciseId,
      set_number: sessionExercise.session_sets.length + 1,
      weight_kg: lastSet?.weight_kg ?? sessionExercise.target_weight_kg ?? 0,
      reps: 0,
      rpe: null,
      completed: false,
      note: null,
    };

    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) =>
        exercise.id === sessionExerciseId
          ? withSets(exercise, [...exercise.session_sets, optimisticSet])
          : exercise,
      ),
    }));
  }

  function addSupersetRound(
    group: SessionWithDetails["session_exercises"],
  ) {
    const setIds = [crypto.randomUUID(), crypto.randomUUID()];
    const optimisticSets = group.map((exercise, index): SessionSet => ({
      id: setIds[index],
      session_exercise_id: exercise.id,
      set_number: exercise.session_sets.length + 1,
      weight_kg:
        exercise.session_sets.at(-1)?.weight_kg ?? exercise.target_weight_kg ?? 0,
      reps: 0,
      rpe: null,
      completed: false,
      note: null,
    }));

    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) => {
        const optimisticSet = optimisticSets.find(
          (set) => set.session_exercise_id === exercise.id,
        );
        return optimisticSet
          ? withSets(exercise, [...exercise.session_sets, optimisticSet])
          : exercise;
      }),
    }));
  }

  function removeSet(setId: string) {
    if (interactionLockRef.current) return;
    const sessionExercise = draftRef.current.session_exercises.find((exercise) =>
      exercise.session_sets.some((set) => set.id === setId),
    );
    if (!sessionExercise || sessionExercise.session_sets.length <= 1) return;
    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) =>
        exercise.id === sessionExercise.id
          ? withSets(
              exercise,
              exercise.session_sets.filter((set) => set.id !== setId),
            )
          : exercise,
      ),
    }));
  }

  function removeSupersetRound(groupId: string) {
    if (interactionLockRef.current) return;
    const group = draftRef.current.session_exercises.filter(
      (exercise) => exercise.superset_group_id === groupId,
    );
    if (group.length !== 2 || group.some((exercise) => exercise.session_sets.length <= 1)) return;
    const removed = group.map((exercise) => exercise.session_sets.at(-1) as SessionSet);

    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) => {
        const removedSet = removed.find((set) => set.session_exercise_id === exercise.id);
        return removedSet
          ? withSets(exercise, exercise.session_sets.filter((set) => set.id !== removedSet.id))
          : exercise;
      }),
    }));
  }

  function reorderExercises(
    sessionExercises: SessionWithDetails["session_exercises"],
  ) {
    if (interactionLockRef.current) return;
    const orderedExercises = orderExercises(sessionExercises);

    mutateDraft((current) => ({
      ...current,
      session_exercises: orderedExercises,
    }));
  }

  async function replaceExercise(
    sessionExerciseId: string,
    candidate: ReplacementCandidate,
  ) {
    if (interactionLockRef.current) return;

    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) => {
        if (exercise.id !== sessionExerciseId) return exercise;

        const hasLoggedValues = exercise.session_sets.some(
          (set) =>
            set.reps > 0 ||
            set.rpe !== null ||
            set.completed ||
            Boolean(set.note) ||
            set.weight_kg !== (exercise.target_weight_kg ?? 0),
        );
        const preserveSets = Boolean(exercise.superset_group_id) || hasLoggedValues;
        const nextSets = preserveSets
          ? exercise.session_sets
          : Array.from({ length: candidate.target.sets }, (_, index) => ({
              id: crypto.randomUUID(),
              session_exercise_id: exercise.id,
              set_number: index + 1,
              weight_kg: candidate.target.weightKg ?? 0,
              reps: 0,
              rpe: null,
              completed: false,
              note: null,
            }));

        return withSets(
          {
            ...exercise,
            exercise_id: candidate.exercise.id,
            exercise: candidate.exercise,
            target_reps_min: candidate.target.repsMin,
            target_reps_max: candidate.target.repsMax,
            target_weight_kg: candidate.target.weightKg,
            rest_seconds: exercise.superset_group_id
              ? exercise.rest_seconds
              : candidate.target.restSeconds,
            notes: candidate.target.notes,
          },
          nextSets,
        );
      }),
    }));
  }

  function updateSet(sessionExerciseId: string, nextSet: SessionSet) {
    if (interactionLockRef.current) return;
    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) =>
        exercise.id === sessionExerciseId
          ? {
              ...exercise,
              session_sets: exercise.session_sets.map((set) =>
                set.id === nextSet.id ? nextSet : set,
              ),
            }
          : exercise,
      ),
    }));
  }

  function toggleExerciseVolumeMultiplier(
    exerciseId: string,
    currentMultiplier: Exercise["volume_multiplier"],
  ) {
    if (syncingStructureRef.current) return;
    const nextMultiplier = currentMultiplier === 2 ? 1 : 2;

    updateDraftExerciseVolumeMultiplier(exerciseId, nextMultiplier);
    syncingStructureRef.current = true;
    setSyncingStructure(true);
    setActionError(null);

    backgroundSyncRef.current = fetch(`/api/exercises/${exerciseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumeMultiplier: nextMultiplier }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to update volume setting.");
      })
      .catch(() => {
        updateDraftExerciseVolumeMultiplier(exerciseId, currentMultiplier);
        setActionError(
          "Unable to update the volume setting. The previous setting was restored.",
        );
      })
      .finally(() => {
        syncingStructureRef.current = false;
        setSyncingStructure(false);
      });
  }

  function updateDraftExerciseVolumeMultiplier(
    exerciseId: string,
    volumeMultiplier: Exercise["volume_multiplier"],
  ) {
    mutateDraft((current) => ({
      ...current,
      session_exercises: current.session_exercises.map((exercise) =>
        exercise.exercise_id === exerciseId
          ? {
              ...exercise,
              exercise: {
                ...exercise.exercise,
                volume_multiplier: volumeMultiplier,
              },
            }
          : exercise,
      ),
    }));
  }

  function startRestTimer(exerciseName: string, seconds: number) {
    if (seconds <= 0) return;
    setRestTimer({
      exerciseName,
      seconds,
      endAt: Date.now() + seconds * 1000,
      visible: true,
    });
    setRestTimerRemainingSeconds(seconds);
  }

  function maybeStartRestTimer(
    exercise: SessionWithDetails["session_exercises"][number],
    setNumber: number,
  ) {
    if (
      shouldStartRestTimer(
        draftRef.current.session_exercises,
        exercise.id,
        setNumber,
      )
    ) {
      const exerciseName = exercise.superset_group_id
        ? draftRef.current.session_exercises
            .filter((item) => item.superset_group_id === exercise.superset_group_id)
            .map((item) => item.exercise.name)
            .join(" + ")
        : exercise.exercise.name;
      startRestTimer(exerciseName, exercise.rest_seconds);
    }
  }

  function createLiveSuperset(index: number) {
    if (interactionLockRef.current) return;
    const previous = draftRef.current.session_exercises;
    const first = previous[index];
    const second = previous[index + 1];
    if (!first || !second || first.session_sets.length !== second.session_sets.length) return;
    const groupId = crypto.randomUUID();
    const next = previous.map((exercise, exerciseIndex) =>
      exerciseIndex === index || exerciseIndex === index + 1
        ? { ...exercise, superset_group_id: groupId, rest_seconds: second.rest_seconds }
        : exercise,
    );
    saveLiveSupersets(next);
  }

  function removeLiveSuperset(groupId: string) {
    if (interactionLockRef.current) return;
    const previous = draftRef.current.session_exercises;
    const next = previous.map((exercise) =>
      exercise.superset_group_id === groupId
        ? { ...exercise, superset_group_id: null }
        : exercise,
    );
    saveLiveSupersets(next);
  }

  function saveLiveSupersets(
    nextExercises: SessionWithDetails["session_exercises"],
  ) {
    mutateDraft((current) => ({ ...current, session_exercises: nextExercises }));
  }

  function mutateDraft(update: (current: SessionWithDetails) => SessionWithDetails) {
    const next = update(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    markSessionDirty();
    setExpandedCompletedExerciseIds((current) => {
      const completedExerciseIds = new Set(
        next.session_exercises
          .filter(isSessionExerciseComplete)
          .map((exercise) => exercise.id),
      );
      const retained = new Set(
        [...current].filter((id) => completedExerciseIds.has(id)),
      );

      return retained.size === current.size ? current : retained;
    });
  }

  function markSessionDirty() {
    if (!persistenceReadyRef.current) return;

    revisionRef.current += 1;
    setSyncStatus(navigator.onLine ? "pending" : "local");
    persistLocalBackup();
    scheduleAutosave();
  }

  function persistLocalBackup() {
    if (
      !persistenceReadyRef.current ||
      revisionRef.current <= syncedRevisionRef.current
    ) {
      return;
    }

    try {
      window.localStorage.setItem(
        liveSessionBackupKey(session.id),
        JSON.stringify(
          createLiveSessionBackup(
            draftRef.current,
            performedAtRef.current,
            notesRef.current,
            revisionRef.current,
          ),
        ),
      );
    } catch {
      setSyncStatus("error");
    }
  }

  function clearLocalBackup() {
    try {
      window.localStorage.removeItem(liveSessionBackupKey(session.id));
    } catch {
      // A confirmed server save is still durable when localStorage is unavailable.
    }
  }

  function scheduleAutosave(delay = AUTOSAVE_DELAY_MS) {
    if (
      !persistenceReadyRef.current ||
      revisionRef.current <= syncedRevisionRef.current
    ) {
      return;
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    if (!navigator.onLine) {
      autosaveTimeoutRef.current = null;
      setSyncStatus("local");
      return;
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void syncSnapshot(false);
    }, delay);
  }

  async function syncSnapshot(showActivity: boolean) {
    if (syncRequestRef.current) return syncRequestRef.current;
    if (revisionRef.current <= syncedRevisionRef.current) return true;

    const snapshotRevision = revisionRef.current;
    const payload = buildLiveSessionSyncPayload(
      draftRef.current,
      performedAtRef.current,
      notesRef.current,
    );
    setSyncStatus("saving");

    const requestPromise = (async () => {
      try {
        const url = `/api/sessions/${session.id}/sync`;
        const init: RequestInit = {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
        const response = showActivity
          ? await fetchWithActivity("Saving workout...", url, init)
          : await fetch(url, init);

        if (!response.ok) {
          throw new Error(await responseErrorMessage(response));
        }

        syncedRevisionRef.current = Math.max(
          syncedRevisionRef.current,
          snapshotRevision,
        );
        if (revisionRef.current <= syncedRevisionRef.current) {
          clearLocalBackup();
          setRecoveredDraft(false);
          setSyncStatus("saved");
        } else {
          persistLocalBackup();
          setSyncStatus("pending");
          scheduleAutosave();
        }
        return true;
      } catch (error) {
        persistLocalBackup();
        setSyncStatus(navigator.onLine ? "error" : "local");
        if (showActivity) {
          setActionError(
            error instanceof Error
              ? `${error.message} Your changes remain on this device.`
              : "Unable to sync this workout. Your changes remain on this device.",
          );
        }
        if (navigator.onLine) scheduleAutosave(AUTOSAVE_RETRY_MS);
        return false;
      }
    })();

    syncRequestRef.current = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (syncRequestRef.current === requestPromise) {
        syncRequestRef.current = null;
      }
    }
  }

  async function flushPendingChanges(showActivity: boolean) {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    await backgroundSyncRef.current;

    while (revisionRef.current > syncedRevisionRef.current) {
      if (!(await syncSnapshot(showActivity))) return false;
    }

    return true;
  }

  function orderExercises(
    sessionExercises: SessionWithDetails["session_exercises"],
  ) {
    return sessionExercises.map((exercise, index) => ({
      ...exercise,
      exercise_order: index + 1,
    }));
  }

  function withSets(
    exercise: SessionWithDetails["session_exercises"][number],
    sets: SessionSet[],
  ) {
    const numberedSets = sets.map((set, index) => ({
      ...set,
      set_number: index + 1,
    }));

    return {
      ...exercise,
      planned_sets: numberedSets.length,
      session_sets: numberedSets,
    };
  }
}

function IncompleteFinishDialog({
  summary,
  onBack,
  onConfirm,
}: {
  summary: IncompleteSessionSummary;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const setLabel = summary.incompleteSetCount === 1 ? "set is" : "sets are";

  return (
    <div
      aria-labelledby="incomplete-finish-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center sm:p-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <h2
          className="text-lg font-bold text-slate-950 dark:text-slate-100"
          id="incomplete-finish-title"
        >
          Finish with unchecked sets?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {summary.incompleteSetCount > 0
            ? `${summary.incompleteSetCount} ${setLabel} still unchecked.`
            : "At least one exercise has no completed sets."}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          {summary.incompleteExerciseNames.join(", ")}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button autoFocus onClick={onBack} type="button" variant="secondary">
            Go back to edit
          </Button>
          <Button onClick={onConfirm} type="button">
            Finish anyway
          </Button>
        </div>
      </div>
    </div>
  );
}

function SessionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}{" "}
      <span className="text-[13px] font-extrabold normal-case tracking-normal tabular-nums text-slate-900">
        {value}
      </span>
    </div>
  );
}

function getSessionStats(session: SessionWithDetails, now: number) {
  const sets = session.session_exercises.flatMap((exercise) =>
    exercise.session_sets,
  );
  const completedSets = sets.filter((set) => set.completed);
  const preparedSets = session.session_exercises.reduce(
    (total, exercise) => total + exercise.planned_sets,
    0,
  );
  const totalVolumeKg = sessionVolume(session);
  const startedAt = new Date(session.started_at).getTime();

  return {
    completedSets: completedSets.length,
    exerciseCount: session.session_exercises.length,
    elapsedSeconds: Math.max(
      0,
      Math.floor((now - (Number.isFinite(startedAt) ? startedAt : now)) / 1000),
    ),
    preparedSets,
    totalVolumeKg,
  };
}

function formatStatNumber(value: number) {
  return new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function SetRow({
  set,
  canRemove,
  disabled,
  removeDisabled,
  onChange,
  onCompleted,
  onRemove,
}: {
  set: SessionSet;
  canRemove: boolean;
  disabled: boolean;
  removeDisabled: boolean;
  onChange: (set: SessionSet) => void;
  onCompleted: () => void;
  onRemove: () => void;
}) {
  const [showNote, setShowNote] = useState(Boolean(set.note));
  const [weightInput, setWeightInput] = useState(formatInputNumber(set.weight_kg));
  const [repsInput, setRepsInput] = useState(formatInputNumber(set.reps));
  const [rpeInput, setRpeInput] = useState(
    set.rpe === null ? String(DEFAULT_RPE) : formatInputNumber(set.rpe),
  );
  const [isRpeExpanded, setIsRpeExpanded] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const canComplete =
    weightInput.trim() !== "" &&
    repsInput.trim() !== "" &&
    Number(repsInput) > 0 &&
    rpeInput.trim() !== "" &&
    Number(rpeInput) > 0;

  return (
    <div
      className={`rounded-xl p-1 transition ${
        set.completed ? "bg-emerald-50" : "bg-slate-50"
      }`}
    >
      <div className="grid grid-cols-[1.4rem_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_2.75rem_1.75rem_1.75rem] items-center gap-1">
        <span className="text-center text-[11px] font-extrabold tabular-nums text-slate-400">
          {set.set_number}
        </span>
        <NumberInput
          ariaLabel={`Set ${set.set_number} weight in kilograms`}
          max={999.99}
          value={weightInput}
          step={0.5}
          onChange={(value) => {
            setWeightInput(value);
            setCompletionError(null);
            onChange({
              ...set,
              weight_kg: parseInputNumber(value, 999.99) ?? 0,
              completed: set.completed && value.trim() !== "",
            });
          }}
        />
        <NumberInput
          ariaLabel={`Set ${set.set_number} reps`}
          inputMode="numeric"
          max={99}
          value={repsInput}
          step={1}
          onChange={(value) => {
            setRepsInput(value);
            setCompletionError(null);
            const reps = parseInputNumber(value, 99) ?? 0;
            onChange({
              ...set,
              reps,
              completed: set.completed && reps > 0,
            });
          }}
        />
        <button
          aria-controls={`set-${set.id}-rpe-control`}
          aria-expanded={isRpeExpanded}
          aria-label={`Set ${set.set_number} RPE ${rpeInput}`}
          className={`h-11 w-full min-w-0 rounded-xl border bg-white px-1 text-base font-bold tabular-nums transition ${
            isRpeExpanded
              ? "border-emerald-600 text-emerald-700"
              : "border-slate-300 text-slate-700"
          }`}
          disabled={disabled}
          onClick={() => setIsRpeExpanded((expanded) => !expanded)}
          type="button"
        >
          {rpeInput}
        </button>
        <button
          className={`flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-semibold transition ${
            set.completed
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-300 bg-white text-slate-400"
          }`}
          disabled={disabled}
          onClick={() => {
            if (set.completed) {
              setCompletionError(null);
              onChange({ ...set, completed: false });
              return;
            }
            if (!canComplete) {
              setCompletionError("Fill kg, reps, and RPE before completing.");
              return;
            }
            setCompletionError(null);
            onChange({ ...set, rpe: Number(rpeInput), completed: true });
            onCompleted();
          }}
          type="button"
          aria-label={`Toggle set ${set.set_number}`}
        >
          {set.completed ? <Check size={18} strokeWidth={3} /> : <Square size={16} />}
        </button>
        <button
          aria-label={
            showNote ? `Hide note for set ${set.set_number}` : `Add note for set ${set.set_number}`
          }
          className={`flex h-11 w-7 items-center justify-center rounded-lg transition hover:bg-slate-100 ${
            set.note ? "text-emerald-700" : "text-slate-400"
          }`}
          onClick={() => setShowNote((visible) => !visible)}
          type="button"
        >
          <MessageSquare size={15} />
        </button>
        <button
          aria-label={`Remove set ${set.set_number}`}
          className="flex h-11 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canRemove || disabled || removeDisabled}
          onClick={onRemove}
          type="button"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {isRpeExpanded ? (
        <div
          className="mt-1.5 grid grid-cols-4 gap-1.5"
          id={`set-${set.id}-rpe-control`}
        >
          {RPE_OPTIONS.map((rpe) => {
            const value = formatInputNumber(rpe);
            const selected = value === rpeInput;

            return (
              <button
                aria-pressed={selected}
                className={`h-11 rounded-xl border text-sm font-bold tabular-nums transition ${
                  selected
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                disabled={disabled}
                key={rpe}
                onClick={() => {
                  setRpeInput(value);
                  setCompletionError(null);
                  onChange({ ...set, rpe, completed: set.completed });
                  setIsRpeExpanded(false);
                }}
                type="button"
              >
                {value}
              </button>
            );
          })}
        </div>
      ) : null}
      {showNote ? (
        <input
          className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          placeholder="Set note (optional)"
          value={set.note ?? ""}
          onChange={(event) => onChange({ ...set, note: event.target.value || null })}
        />
      ) : null}
      {completionError ? (
        <p className="mt-1.5 px-1 text-xs font-semibold text-rose-700" role="alert">
          {completionError}
        </p>
      ) : null}
    </div>
  );
}

function RestTimerBanner({
  exerciseName,
  remainingSeconds,
  totalSeconds,
  onDismiss,
  onSkip,
}: {
  exerciseName: string;
  remainingSeconds: number;
  totalSeconds: number;
  onDismiss: () => void;
  onSkip: () => void;
}) {
  const progress =
    totalSeconds > 0
      ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100))
      : 0;

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-lg">
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tabular-nums tracking-tight text-emerald-950">
              {formatDuration(remainingSeconds)}
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
              Rest
            </span>
          </div>
          <div className="truncate text-xs font-semibold text-emerald-800">
            after {exerciseName}
          </div>
        </div>
        <button
          className="h-9 shrink-0 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition hover:bg-emerald-500"
          onClick={onSkip}
          type="button"
        >
          Skip
        </button>
        <button
          className="h-9 shrink-0 rounded-xl px-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </button>
      </div>
      <div className="h-1.5 bg-emerald-100">
        <div
          className="h-full bg-emerald-600 transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function syncStatusLabel(
  status: "saved" | "pending" | "saving" | "local" | "error",
) {
  switch (status) {
    case "saved":
      return "Saved";
    case "pending":
      return "Saved on this device · syncing soon";
    case "saving":
      return "Saved on this device · syncing…";
    case "local":
      return "Offline · safely saved on this device";
    case "error":
      return "Sync paused · safely saved on this device";
  }
}

async function responseErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall back to a stable user-facing message for non-JSON server errors.
  }

  return response.status === 401
    ? "Your sign-in expired. Sign in again before syncing this workout."
    : "Unable to sync this workout right now.";
}

function toLocalInputValue(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromLocalInput(value: string) {
  return new Date(value).toISOString();
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDateTimeInputLabel(value: string) {
  const [datePart, timePart] = value.split("T");

  if (!datePart || !timePart) return value;

  const [, month, day] = datePart.split("-");
  const [hour = "0", minute = "00"] = timePart.split(":");
  const monthName = SHORT_MONTHS[Number(month) - 1] ?? month;
  const hourNumber = Number(hour);
  const hour12 = hourNumber % 12 || 12;
  const period = hourNumber >= 12 ? "PM" : "AM";

  return `${Number(day)} ${monthName} ${hour12}:${minute} ${period}`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const minutePart =
    hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const time = `${minutePart}:${String(remainingSeconds).padStart(2, "0")}`;

  return hours > 0 ? `${hours}:${time}` : time;
}

function formatInputNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}

function parseInputNumber(value: string, max: number) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(0, parsed));
}

function NumberInput({
  ariaLabel,
  inputMode = "decimal",
  max,
  value,
  step,
  onChange,
}: {
  ariaLabel: string;
  inputMode?: "decimal" | "numeric";
  max: number;
  value: string;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className="h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-1 text-center text-base font-bold tabular-nums"
      inputMode={inputMode}
      max={max}
      min={0}
      style={{ fontSize: 16, WebkitTextSizeAdjust: "100%" }}
      type="number"
      step={step}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = event.target.value;
        const parsed = parseInputNumber(next, max);
        onChange(parsed === null ? next : String(parsed));
      }}
    />
  );
}
