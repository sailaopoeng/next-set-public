export type RestTimerState = {
  exerciseName: string;
  seconds: number;
  endAt: number;
  visible: boolean;
};

export const REST_TIMER_STORAGE_VERSION = 1;

export function restTimerStorageKey(sessionId: string) {
  return `nextset.rest-timer.v${REST_TIMER_STORAGE_VERSION}:${sessionId}`;
}

export function remainingRestSeconds(timer: Pick<RestTimerState, "endAt">, now = Date.now()) {
  return Math.max(0, Math.ceil((timer.endAt - now) / 1000));
}

export function parseRestTimerState(
  serialized: string | null,
  now = Date.now(),
): RestTimerState | null {
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Partial<RestTimerState> & {
      version?: number;
    };
    if (
      value.version !== REST_TIMER_STORAGE_VERSION ||
      typeof value.exerciseName !== "string" ||
      !Number.isFinite(value.seconds) ||
      !Number.isFinite(value.endAt) ||
      typeof value.visible !== "boolean"
    ) {
      return null;
    }

    const timer: RestTimerState = {
      exerciseName: value.exerciseName,
      seconds: Number(value.seconds),
      endAt: Number(value.endAt),
      visible: value.visible,
    };

    if (remainingRestSeconds(timer, now) <= 0) return null;
    return timer;
  } catch {
    return null;
  }
}

export function serializeRestTimerState(timer: RestTimerState) {
  return JSON.stringify({
    version: REST_TIMER_STORAGE_VERSION,
    ...timer,
  });
}

export function readRestTimer(sessionId: string, now = Date.now()) {
  try {
    return parseRestTimerState(
      window.localStorage.getItem(restTimerStorageKey(sessionId)),
      now,
    );
  } catch {
    return null;
  }
}

export function consumeRestTimer(sessionId: string, now = Date.now()) {
  try {
    const key = restTimerStorageKey(sessionId);
    const serialized = window.localStorage.getItem(key);
    if (!serialized) return { timer: null, expired: false };

    const timer = parseRestTimerState(serialized, now);
    if (timer) return { timer, expired: false };

    window.localStorage.removeItem(key);
    return { timer: null, expired: true };
  } catch {
    return { timer: null, expired: false };
  }
}

export function writeRestTimer(sessionId: string, timer: RestTimerState | null) {
  try {
    const key = restTimerStorageKey(sessionId);
    if (!timer || remainingRestSeconds(timer) <= 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, serializeRestTimerState(timer));
  } catch {
    // Rest timer persistence is best-effort.
  }
}

export function clearRestTimer(sessionId: string) {
  try {
    window.localStorage.removeItem(restTimerStorageKey(sessionId));
  } catch {
    // Ignore storage failures.
  }
}
