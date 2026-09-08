alter table public.workout_template_exercises
  add column superset_group_id uuid;

alter table public.session_exercises
  add column superset_group_id uuid;

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
    superset_group_id,
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
    exercise.superset_group_id,
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
    superset_group_id uuid,
    notes text
  );
end;
$$;

create or replace function public.replace_session_supersets(
  p_session_id uuid,
  p_groups jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  group_row record;
  pair_ids uuid[];
  used_exercise_ids uuid[] := '{}';
  used_group_ids uuid[] := '{}';
  matching_rows integer;
  minimum_sets integer;
  maximum_sets integer;
  minimum_order integer;
  maximum_order integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if jsonb_typeof(p_groups) <> 'array' then
    raise exception 'Superset groups must be an array.';
  end if;

  if not exists (
    select 1
    from public.workout_sessions
    where id = p_session_id
      and user_id = current_user_id
      and status = 'active'
  ) then
    raise exception 'Active workout session not found.';
  end if;

  for group_row in
    select *
    from jsonb_to_recordset(p_groups) as item(
      group_id uuid,
      exercise_ids uuid[],
      rest_seconds integer
    )
  loop
    pair_ids := group_row.exercise_ids;

    if group_row.group_id is null
      or array_length(pair_ids, 1) <> 2
      or pair_ids[1] = pair_ids[2]
      or group_row.rest_seconds not between 0 and 900
      or group_row.group_id = any(used_group_ids)
      or pair_ids[1] = any(used_exercise_ids)
      or pair_ids[2] = any(used_exercise_ids) then
      raise exception 'Superset group is invalid.';
    end if;

    select count(*), min(planned_sets), max(planned_sets),
           min(exercise_order), max(exercise_order)
    into matching_rows, minimum_sets, maximum_sets, minimum_order, maximum_order
    from public.session_exercises
    where user_id = current_user_id
      and session_id = p_session_id
      and id = any(pair_ids);

    if matching_rows <> 2
      or minimum_sets <> maximum_sets
      or maximum_order - minimum_order <> 1 then
      raise exception 'Superset exercises must be adjacent with matching set counts.';
    end if;

    used_group_ids := array_append(used_group_ids, group_row.group_id);
    used_exercise_ids := used_exercise_ids || pair_ids;
  end loop;

  update public.session_exercises
  set superset_group_id = null
  where user_id = current_user_id
    and session_id = p_session_id;

  for group_row in
    select *
    from jsonb_to_recordset(p_groups) as item(
      group_id uuid,
      exercise_ids uuid[],
      rest_seconds integer
    )
  loop
    update public.session_exercises
    set superset_group_id = group_row.group_id,
        rest_seconds = group_row.rest_seconds
    where user_id = current_user_id
      and session_id = p_session_id
      and id = any(group_row.exercise_ids);
  end loop;
end;
$$;

revoke all on function public.replace_session_supersets(uuid, jsonb) from public;
grant execute on function public.replace_session_supersets(uuid, jsonb) to authenticated;
