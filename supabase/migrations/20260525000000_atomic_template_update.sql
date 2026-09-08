create or replace function public.replace_workout_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_sort_order integer,
  p_is_active boolean,
  p_exercises jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) = 0 then
    raise exception 'A template must include at least one exercise.';
  end if;

  update public.workout_templates
  set name = p_name,
      description = p_description,
      sort_order = p_sort_order,
      is_active = p_is_active
  where id = p_template_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Template not found.';
  end if;

  delete from public.workout_template_exercises
  where template_id = p_template_id
    and user_id = current_user_id;

  insert into public.workout_template_exercises (
    user_id,
    template_id,
    exercise_id,
    exercise_order,
    target_sets,
    target_reps_min,
    target_reps_max,
    target_weight_kg,
    target_set_weights_kg,
    rest_seconds,
    notes
  )
  select
    current_user_id,
    p_template_id,
    exercise.exercise_id,
    exercise.exercise_order,
    exercise.target_sets,
    exercise.target_reps_min,
    exercise.target_reps_max,
    exercise.target_weight_kg,
    coalesce(exercise.target_set_weights_kg, '[]'::jsonb),
    exercise.rest_seconds,
    exercise.notes
  from jsonb_to_recordset(p_exercises) as exercise(
    exercise_id uuid,
    exercise_order integer,
    target_sets integer,
    target_reps_min integer,
    target_reps_max integer,
    target_weight_kg numeric,
    target_set_weights_kg jsonb,
    rest_seconds integer,
    notes text
  );
end;
$$;

revoke all on function public.replace_workout_template(uuid, text, text, integer, boolean, jsonb)
  from public;
grant execute on function public.replace_workout_template(uuid, text, text, integer, boolean, jsonb)
  to authenticated;
