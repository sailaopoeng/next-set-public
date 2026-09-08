"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { LoaderCircle } from "lucide-react";

type Activity = {
  id: number;
  label: string;
};

type ActivityContextValue = {
  runWithActivity: <T>(label: string, task: () => Promise<T>) => Promise<T>;
  startActivity: (label: string) => () => void;
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function AppActivityProvider({ children }: { children: ReactNode }) {
  const nextActivityId = useRef(0);
  const [activities, setActivities] = useState<Activity[]>([]);

  const startActivity = useCallback((label: string) => {
    const id = nextActivityId.current++;
    let finished = false;

    setActivities((current) => [...current, { id, label }]);

    return () => {
      if (finished) return;
      finished = true;
      setActivities((current) =>
        current.filter((activity) => activity.id !== id),
      );
    };
  }, []);

  const runWithActivity = useCallback(
    async <T,>(label: string, task: () => Promise<T>) => {
      const finish = startActivity(label);

      try {
        return await task();
      } finally {
        finish();
      }
    },
    [startActivity],
  );

  const value = useMemo(
    () => ({ runWithActivity, startActivity }),
    [runWithActivity, startActivity],
  );
  const label = activities.at(-1)?.label;

  return (
    <ActivityContext.Provider value={value}>
      {children}
      {label ? <ActivityIndicator label={label} /> : null}
    </ActivityContext.Provider>
  );
}

export function useAppActivity() {
  const { runWithActivity } = useActivityContext();

  const fetchWithActivity = useCallback(
    (label: string, input: RequestInfo | URL, init?: RequestInit) =>
      runWithActivity(label, () => fetch(input, init)),
    [runWithActivity],
  );

  return { fetchWithActivity, runWithActivity };
}

export function useTrackedRouter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { startActivity } = useActivityContext();

  useEffect(() => {
    if (!isPending) return;

    return startActivity("Loading page...");
  }, [isPending, startActivity]);

  const runNavigation = useCallback(
    (navigate: () => void) => startTransition(navigate),
    [],
  );

  const push = useCallback(
    (href: string) => runNavigation(() => router.push(href)),
    [router, runNavigation],
  );
  const replace = useCallback(
    (href: string) => runNavigation(() => router.replace(href)),
    [router, runNavigation],
  );
  const refresh = useCallback(
    () => runNavigation(() => router.refresh()),
    [router, runNavigation],
  );

  return { push, refresh, replace };
}

export function AppLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingLinkActivity />
    </Link>
  );
}

function PendingLinkActivity() {
  const { pending } = useLinkStatus();
  const { startActivity } = useActivityContext();

  useEffect(() => {
    if (!pending) return;

    return startActivity("Loading page...");
  }, [pending, startActivity]);

  return null;
}

function ActivityIndicator({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="h-1 overflow-hidden bg-emerald-100" aria-hidden="true">
        <div className="app-loading-progress h-full w-1/2 bg-emerald-600" />
      </div>
      <div
        aria-live="polite"
        className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg"
        role="status"
      >
        <LoaderCircle className="animate-spin text-emerald-600" size={17} />
        {label}
      </div>
    </div>
  );
}

function useActivityContext() {
  const context = useContext(ActivityContext);

  if (!context) {
    throw new Error("App activity components must be rendered within AppActivityProvider.");
  }

  return context;
}
