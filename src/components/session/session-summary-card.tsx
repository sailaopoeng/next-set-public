import { AppLink } from "@/components/ui/app-activity";
import type { SessionWithDetails } from "@/lib/domain";
import { sessionVolume } from "@/lib/workout-metrics";
import { Pencil } from "lucide-react";

export function SessionSummaryCard({
  session,
  isOwner,
}: {
  session: SessionWithDetails;
  isOwner: boolean;
}) {
  const completedSets = session.session_exercises.flatMap((exercise) =>
    exercise.session_sets.filter((set) => set.completed),
  );
  const totalVolume = sessionVolume(session);
  const supersetCount = new Set(
    session.session_exercises
      .map((exercise) => exercise.superset_group_id)
      .filter((groupId): groupId is string => Boolean(groupId)),
  ).size;

  const detailHref =
    session.status === "completed"
      ? `/sessions/${session.id}/review`
      : `/sessions/${session.id}`;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50">
      <AppLink className="block min-w-0 flex-1" href={detailHref}>
        <div>
          <div className="flex items-center gap-2">
            <span className="truncate font-bold">{session.name}</span>
          </div>
          <div className="mt-0.5 text-xs font-medium text-slate-500">
            {formatDate(session.performed_at)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-700">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              {formatNumber(totalVolume)} kg
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {completedSets.length}{" "}
              {completedSets.length === 1 ? "set" : "sets"}
            </span>
            {supersetCount > 0 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                {supersetCount} {supersetCount === 1 ? "superset" : "supersets"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5 text-slate-700">
          {session.session_exercises.length === 0 ? (
            <p className="text-xs text-slate-500">No exercises logged.</p>
          ) : (
            session.session_exercises.map((exercise) => {
              const sets = exercise.session_sets.filter((set) => set.completed);

              return (
                <p key={exercise.id} className="text-[11px] leading-4">
                  <span className="font-semibold">{exercise.exercise.name}</span>{" "}
                  {sets.length === 0
                    ? "No completed sets"
                    : `- ${sets.length}s: ${formatCompactSets(sets)}`}
                </p>
              );
            })
          )}
        </div>
      </AppLink>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
        <AppLink
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
            session.status === "completed"
              ? "bg-slate-100 text-slate-600"
              : "bg-emerald-100 text-emerald-800"
          }`}
          href={detailHref}
        >
          {session.status}
        </AppLink>
        {isOwner && session.status === "completed" ? (
          <AppLink
            aria-label={`Edit ${session.name}`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            href={`/sessions/${session.id}`}
            title="Edit workout"
          >
            <Pencil size={15} />
          </AppLink>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCompactSets(
  sets: Array<{
    reps: number;
    weight_kg: number;
  }>,
) {
  const compacted: string[] = [];
  let current: { weight: number; reps: number; count: number } | null = null;

  for (const set of sets) {
    if (
      current !== null &&
      current.weight === set.weight_kg &&
      current.reps === set.reps
    ) {
      current.count += 1;
      continue;
    }

    if (current !== null) {
      compacted.push(formatSetGroup(current.weight, current.reps, current.count));
    }

    current = { weight: set.weight_kg, reps: set.reps, count: 1 };
  }

  if (current !== null) {
    compacted.push(formatSetGroup(current.weight, current.reps, current.count));
  }

  return compacted.join(" ");
}

function formatSetGroup(weightKg: number, reps: number, count: number) {
  const base = `${formatNumber(weightKg)}x${reps}`;
  return count > 1 ? `${base}x${count}` : base;
}
