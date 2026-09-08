alter table public.workout_template_exercises
  add column if not exists target_set_weights_kg jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_template_exercises_set_weights_shape'
  ) then
    alter table public.workout_template_exercises
      add constraint workout_template_exercises_set_weights_shape check (
        jsonb_typeof(target_set_weights_kg) = 'array'
        and jsonb_array_length(target_set_weights_kg) <= 12
      );
  end if;
end $$;
