import { AppLink } from "@/components/ui/app-activity";
import type { SessionWithDetails } from "@/lib/domain";
import { buildSupersetBlocks } from "@/lib/supersets";

export function ReadOnlySession({ session }: { session: SessionWithDetails }) {
  const blocks = buildSupersetBlocks(
    session.session_exercises,
    (exercise) => exercise.superset_group_id,
  );
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{session.name}</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Logged workout details and completed set performance.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {session.status}
          </span>
        </div>
        {session.notes ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
            {session.notes}
          </p>
        ) : null}
        {session.status === "completed" ? (
          <AppLink
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
            href={`/sessions/${session.id}/review#ai-review`}
          >
            View AI review
          </AppLink>
        ) : null}
      </section>
      {blocks.map((block) => block.groupId ? (
        <section className="rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm dark:bg-slate-900" key={block.id}>
          <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Superset · {block.items[0].session_sets.length} rounds · {block.items[0].rest_seconds}s rest
          </p>
          <h2 className="mt-1 text-base font-bold">{block.items[0].exercise.name} + {block.items[1].exercise.name}</h2>
          <div className="mt-3 space-y-2">
            {block.items[0].session_sets.map((_, roundIndex) => (
              <div className="rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/30" key={roundIndex}>
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Round {roundIndex + 1}</p>
                {block.items.map((exercise, exerciseIndex) => {
                  const set = exercise.session_sets[roundIndex];
                  return (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-sm" key={exercise.id}>
                      <span className="w-5 font-extrabold text-emerald-700">{exerciseIndex === 0 ? "A" : "B"}</span>
                      <span className="min-w-28 font-bold">{exercise.exercise.name}</span>
                      <span className="font-bold tabular-nums">{set.weight_kg}kg</span>
                      <span className="tabular-nums">{set.reps} reps</span>
                      <span className="tabular-nums">RPE {set.rpe ?? "-"}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ) : block.items.map((exercise) => (
        <section
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          key={exercise.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{exercise.exercise.name}</h2>
            {exercise.exercise.volume_multiplier === 2 ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                kg each · ×2 volume
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Target {exercise.planned_sets} x {exercise.target_reps_min}-
            {exercise.target_reps_max}
            {exercise.target_weight_kg !== null
              ? ` @ ${exercise.target_weight_kg}kg`
              : ""}
          </p>
          {exercise.notes ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {exercise.notes}
            </p>
          ) : null}
          <div className="mt-3 space-y-1.5">
            {exercise.session_sets.map((set) => (
              <div
                className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl p-2.5 text-sm ${
                  set.completed
                    ? "bg-emerald-50/60 dark:bg-emerald-950/30"
                    : "bg-slate-50 dark:bg-slate-950"
                }`}
                key={set.id}
              >
                <span className="w-10 text-xs font-bold text-slate-400">
                  S{set.set_number}
                </span>
                <span className="font-bold tabular-nums">
                  {set.weight_kg}kg
                  {exercise.exercise.volume_multiplier === 2 ? " each" : ""}
                </span>
                <span className="tabular-nums">{set.reps} reps</span>
                <span className="tabular-nums">RPE {set.rpe ?? "-"}</span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {set.completed ? "Completed" : "Not completed"}
                </span>
                {set.note ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {set.note}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )))}
    </div>
  );
}
