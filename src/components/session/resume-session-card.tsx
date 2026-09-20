import { Play } from "lucide-react";

import { AppLink } from "@/components/ui/app-activity";
import type { SessionWithDetails } from "@/lib/domain";

export function ResumeSessionCard({
  session,
  isOwner,
}: {
  session: SessionWithDetails;
  isOwner: boolean;
}) {
  const plannedSets = session.session_exercises.reduce(
    (total, exercise) => total + exercise.session_sets.length,
    0,
  );
  const completedSets = session.session_exercises.reduce(
    (total, exercise) =>
      total + exercise.session_sets.filter((set) => set.completed).length,
    0,
  );
  const href = `/sessions/${session.id}`;

  return (
    <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
            <span
              aria-hidden="true"
              className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-600"
            />
            In progress
          </p>
          <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-slate-950">
            {session.name}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {completedSets}/{plannedSets} sets · {session.session_exercises.length}{" "}
            {session.session_exercises.length === 1 ? "exercise" : "exercises"}
          </p>
        </div>
      </div>
      <AppLink
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
        href={href}
      >
        <Play size={16} />
        {isOwner ? "Resume workout" : "View in-progress workout"}
      </AppLink>
    </section>
  );
}
