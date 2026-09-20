type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

let sentinel: WakeLockSentinelLike | null = null;

function wakeLockApi() {
  return typeof navigator === "undefined"
    ? null
    : (
        navigator as Navigator & {
          wakeLock?: {
            request: (type: "screen") => Promise<WakeLockSentinelLike>;
          };
        }
      ).wakeLock;
}

export async function requestScreenWakeLock() {
  const api = wakeLockApi();
  if (!api) return;

  try {
    if (sentinel && !sentinel.released) return;
    sentinel = await api.request("screen");
  } catch {
    sentinel = null;
  }
}

export async function releaseScreenWakeLock() {
  if (!sentinel) return;

  try {
    if (!sentinel.released) await sentinel.release();
  } catch {
    // Ignore browsers that already released the lock.
  } finally {
    sentinel = null;
  }
}
