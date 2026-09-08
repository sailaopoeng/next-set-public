alter table public.workout_template_exercises
  alter column rest_seconds set default 90;

alter table public.session_exercises
  alter column rest_seconds set default 90;

alter table public.ai_exercise_decisions
  alter column suggested_rest_seconds set default 90;

alter table public.workout_suggestion_exercises
  alter column rest_seconds set default 90;
