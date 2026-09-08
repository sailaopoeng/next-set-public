import type { Exercise, TemplateExercise, WorkoutTemplate } from "@/lib/domain";
import { buildSupersetBlocks } from "@/lib/supersets";

type TemplateWithExercises = WorkoutTemplate & {
  workout_template_exercises: Array<TemplateExercise & { exercise: Exercise }>;
};

export function TemplateReadOnly({
  template,
}: {
  template: TemplateWithExercises;
}) {
  const blocks = buildSupersetBlocks(
    template.workout_template_exercises,
    (exercise) => exercise.superset_group_id,
  );

  return (
    <div className="space-y-3">
      {blocks.map((block, blockIndex) => (
        <section
          className={`rounded-2xl border bg-white p-4 shadow-sm ${block.groupId ? "border-emerald-300" : "border-slate-200"}`}
          key={block.id}
        >
          {block.groupId ? (
            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-emerald-700">
              Superset · {block.items[0].target_sets} rounds · {block.items[0].rest_seconds}s rest
            </p>
          ) : null}
          {block.items.map((exercise, exerciseIndex) => (
          <div className={block.items.length > 1 && exerciseIndex > 0 ? "mt-4 border-t border-emerald-100 pt-4" : ""} key={exercise.id}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-extrabold tabular-nums text-slate-500">
              {block.groupId ? (exerciseIndex === 0 ? "A" : "B") : blockIndex + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold">{exercise.exercise.name}</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {exercise.exercise.primary_muscle_group} /{" "}
                {exercise.exercise.equipment ?? "equipment optional"}
              </p>
              <p className="mt-2.5 text-sm font-bold tabular-nums text-slate-700">
                {exercise.target_sets} x {formatReps(exercise)} reps
                {exercise.target_weight_kg !== null
                  ? ` @ ${exercise.target_weight_kg}kg`
                  : ""}
              </p>
              {exercise.target_set_weights_kg.length > 0 ? (
                <p className="mt-1 text-sm tabular-nums text-slate-600">
                  Set weights: {formatSetWeights(exercise)}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-slate-600">
                {block.groupId ? "Back-to-back" : `Rest: ${exercise.rest_seconds}s`}
              </p>
              {exercise.notes ? (
                <p className="mt-2 text-sm text-slate-500">{exercise.notes}</p>
              ) : null}
            </div>
          </div>
          </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function formatReps(exercise: TemplateExercise) {
  return exercise.target_reps_min === exercise.target_reps_max
    ? String(exercise.target_reps_min)
    : `${exercise.target_reps_min}-${exercise.target_reps_max}`;
}

function formatSetWeights(exercise: TemplateExercise) {
  return exercise.target_set_weights_kg
    .map((weight) => (weight === null ? "-" : `${weight}kg`))
    .join(" / ");
}
