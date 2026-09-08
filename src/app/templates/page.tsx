import { AppShell } from "@/components/layout/app-shell";
import { ImportStarterButton, StartTemplateButton } from "@/components/ui/action-buttons";
import { AppLink } from "@/components/ui/app-activity";
import { getPageViewer } from "@/lib/auth/server";
import type { TemplateExercise } from "@/lib/domain";
import { listTemplates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const templates = ownerId ? await listTemplates(supabase, ownerId) : [];

  return (
    <AppShell isOwner={isOwner}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-slate-600">
            Compare each workout and its prescribed sets and reps at a glance.
          </p>
        </div>
        {isOwner ? <ImportStarterButton /> : null}
      </div>
      {templates.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm text-slate-600">No workout templates available.</p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          {templates.map((template) => (
            <article
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              key={template.id}
            >
              <header className="border-b border-slate-100 p-4">
                <h2 className="text-base font-bold">{template.name}</h2>
                {isOwner ? (
                  <div className="mt-3">
                    <StartTemplateButton templateId={template.id} />
                  </div>
                ) : null}
              </header>
              <div className="flex-1 space-y-1.5 p-3">
                {template.workout_template_exercises.map((exercise, index) => (
                  <div
                    className="rounded-xl bg-slate-50 p-2.5"
                    key={exercise.id}
                  >
                    <div className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-[10px] font-extrabold tabular-nums text-slate-400 shadow-sm">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">
                          {exercise.exercise.name}
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-600">
                          {formatTarget(exercise)}
                          {formatWeight(exercise)
                            ? ` · ${formatWeight(exercise)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <footer className="border-t border-slate-100 p-3">
                {isOwner ? (
                  <div className="space-y-2">
                    <StartTemplateButton templateId={template.id} />
                    <AppLink
                      className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-bold hover:bg-slate-50"
                      href={`/templates/${template.id}`}
                    >
                      Edit
                    </AppLink>
                  </div>
                ) : (
                  <AppLink
                    className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-bold hover:bg-slate-50"
                    href={`/templates/${template.id}`}
                  >
                    View details
                  </AppLink>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}

function formatTarget(exercise: TemplateExercise) {
  const reps =
    exercise.target_reps_min === exercise.target_reps_max
      ? String(exercise.target_reps_min)
      : `${exercise.target_reps_min}-${exercise.target_reps_max}`;

  return `${exercise.target_sets} x ${reps} reps`;
}

function formatWeight(exercise: TemplateExercise) {
  const weights = exercise.target_set_weights_kg.filter(
    (weight): weight is number => weight !== null,
  );

  if (weights.length > 0) {
    const uniqueWeights = new Set(weights);
    return uniqueWeights.size === 1
      ? `@ ${weights[0]}kg`
      : `Sets: ${weights.map((weight) => `${weight}kg`).join(" / ")}`;
  }

  return exercise.target_weight_kg !== null
    ? `@ ${exercise.target_weight_kg}kg`
    : null;
}
