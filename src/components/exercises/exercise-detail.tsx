import { AppLink } from "@/components/ui/app-activity";
import { ExerciseStrengthChart } from "@/components/exercises/exercise-strength-chart";
import type { Exercise } from "@/lib/domain";
import type { ExerciseDetailAnalytics } from "@/server/analytics/calculations";

export function ExerciseDetail({
  exercise,
  analytics,
}: {
  exercise: Exercise;
  analytics: ExerciseDetailAnalytics;
}) {
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <AppLink
          className="text-sm font-bold text-emerald-700"
          href="/exercises"
        >
          Back to exercises
        </AppLink>
        <div className="mt-3">
          <h1 className="text-xl font-bold tracking-tight">{exercise.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {exercise.primary_muscle_group} /{" "}
            {exercise.equipment ?? "equipment optional"} / {exercise.lift_category}
          </p>
          {exercise.notes ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {exercise.notes}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard
          label="Last logged"
          value={
            analytics.lastPerformedAt
              ? formatDate(analytics.lastPerformedAt)
              : "-"
          }
        />
        <StatCard
          label="Max weight"
          value={
            analytics.maxWeightSet
              ? `${formatNumber(analytics.maxWeightSet.value)}kg x ${analytics.maxWeightSet.reps}`
              : "-"
          }
        />
        <StatCard
          label="Max volume"
          value={
            analytics.maxVolumeSession
              ? `${formatNumber(analytics.maxVolumeSession.value)}kg`
              : "-"
          }
        />
        <StatCard
          label="Best e1RM"
          value={
            analytics.bestEstimatedOneRepMax
              ? `${formatNumber(analytics.bestEstimatedOneRepMax.value)}kg`
              : "-"
          }
        />
      </section>

      <ExerciseStrengthChart points={analytics.strengthPoints} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold">History</h2>
        <div className="mt-3 space-y-2.5">
          {analytics.history.length === 0 ? (
            <p className="text-sm text-slate-600">
              No completed sessions logged this exercise yet.
            </p>
          ) : (
            analytics.history.map((item) => (
              <article
                className="rounded-2xl border border-slate-200 p-3"
                key={item.sessionId}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <AppLink
                      className="font-bold text-emerald-700"
                      href={`/sessions/${item.sessionId}/review`}
                    >
                      {item.sessionName}
                    </AppLink>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {formatDateTime(item.performedAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {item.sets.filter((set) => set.completed).length} completed
                  </span>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {item.sets.map((set) => (
                    <div
                      className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl p-2.5 text-sm ${
                        set.completed
                          ? "bg-emerald-50/60"
                          : "bg-slate-50"
                      }`}
                      key={set.id}
                    >
                      <span className="w-10 text-xs font-bold text-slate-400">
                        S{set.set_number}
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatNumber(set.weight_kg)}kg
                      </span>
                      <span className="tabular-nums">{set.reps} reps</span>
                      <span className="tabular-nums">RPE {set.rpe ?? "-"}</span>
                      <span className="text-xs font-medium text-slate-500">
                        {set.completed ? "Completed" : "Not completed"}
                      </span>
                      {set.note ? (
                        <span className="text-xs text-slate-500">
                          {set.note}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate text-base font-extrabold tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-SG", { maximumFractionDigits: 1 }).format(
    value,
  );
}
