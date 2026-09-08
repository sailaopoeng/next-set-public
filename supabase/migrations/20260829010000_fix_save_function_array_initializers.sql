create or replace function public.sync_live_session(
  p_session_id uuid,
  p_performed_at timestamptz,
  p_notes text,
  p_exercises jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_status text;
  exercise_row record;
  set_row record;
  snapshot_exercise_ids uuid[] := array[]::uuid[];
  snapshot_library_ids uuid[] := array[]::uuid[];
  snapshot_set_ids uuid[];
  all_set_ids uuid[] := array[]::uuid[];
  synced_at timestamptz;
  expected_order integer := 1;
  expected_set_number integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if jsonb_typeof(p_exercises) <> 'array'
    or jsonb_array_length(p_exercises) > 30 then
    raise exception 'Workout exercises must be an array with at most 30 entries.';
  end if;

  select status
  into current_status
  from public.workout_sessions
  where id = p_session_id
    and user_id = current_user_id
  for update;

  if current_status is null then
    raise exception 'Workout session not found.';
  end if;

  if current_status = 'cancelled' then
    raise exception 'Cancelled workouts cannot be edited.';
  end if;

  for exercise_row in
    select *
    from jsonb_to_recordset(p_exercises) as item(
      id uuid,
      exercise_id uuid,
      exercise_order integer,
      target_reps_min integer,
      target_reps_max integer,
      target_weight_kg numeric,
      rest_seconds integer,
      superset_group_id uuid,
      notes text,
      sets jsonb
    )
  loop
    if exercise_row.id is null
      or exercise_row.exercise_id is null
      or exercise_row.id = any(snapshot_exercise_ids)
      or exercise_row.exercise_id = any(snapshot_library_ids)
      or exercise_row.exercise_order <> expected_order
      or exercise_row.target_reps_min not between 1 and 100
      or exercise_row.target_reps_max not between exercise_row.target_reps_min and 100
      or exercise_row.target_weight_kg is not null
        and exercise_row.target_weight_kg not between 0 and 1000
      or exercise_row.rest_seconds not between 0 and 900
      or jsonb_typeof(exercise_row.sets) <> 'array'
      or jsonb_array_length(exercise_row.sets) not between 1 and 12 then
      raise exception 'Workout exercise snapshot is invalid.';
    end if;

    if not exists (
      select 1
      from public.exercises
      where id = exercise_row.exercise_id
        and user_id = current_user_id
    ) then
      raise exception 'Workout exercise does not belong to this user.';
    end if;

    if exists (
      select 1
      from public.session_exercises
      where id = exercise_row.id
        and user_id = current_user_id
        and session_id <> p_session_id
    ) then
      raise exception 'Session exercise ID belongs to another workout.';
    end if;

    snapshot_exercise_ids := array_append(snapshot_exercise_ids, exercise_row.id);
    snapshot_library_ids := array_append(snapshot_library_ids, exercise_row.exercise_id);
    snapshot_set_ids := array[]::uuid[];
    expected_set_number := 1;

    for set_row in
      select *
      from jsonb_to_recordset(exercise_row.sets) as item(
        id uuid,
        set_number integer,
        weight_kg numeric,
        reps integer,
        rpe numeric,
        completed boolean,
        note text
      )
    loop
      if set_row.id is null
        or set_row.id = any(snapshot_set_ids)
        or set_row.id = any(all_set_ids)
        or set_row.set_number <> expected_set_number
        or set_row.weight_kg not between 0 and 1000
        or set_row.reps not between 0 and 200
        or set_row.rpe is not null and set_row.rpe not between 1 and 10
        or set_row.completed is null then
        raise exception 'Workout set snapshot is invalid.';
      end if;

      if exists (
        select 1
        from public.session_sets
        where id = set_row.id
          and user_id = current_user_id
          and session_id <> p_session_id
      ) then
        raise exception 'Set ID belongs to another workout.';
      end if;

      snapshot_set_ids := array_append(snapshot_set_ids, set_row.id);
      all_set_ids := array_append(all_set_ids, set_row.id);
      expected_set_number := expected_set_number + 1;
    end loop;

    expected_order := expected_order + 1;
  end loop;

  delete from public.session_exercises
  where user_id = current_user_id
    and session_id = p_session_id
    and not (id = any(snapshot_exercise_ids));

  for exercise_row in
    select *
    from jsonb_to_recordset(p_exercises) as item(
      id uuid,
      exercise_id uuid,
      exercise_order integer,
      target_reps_min integer,
      target_reps_max integer,
      target_weight_kg numeric,
      rest_seconds integer,
      superset_group_id uuid,
      notes text,
      sets jsonb
    )
  loop
    insert into public.session_exercises (
      id,
      user_id,
      session_id,
      exercise_id,
      exercise_order,
      planned_sets,
      target_reps_min,
      target_reps_max,
      target_weight_kg,
      rest_seconds,
      superset_group_id,
      notes
    ) values (
      exercise_row.id,
      current_user_id,
      p_session_id,
      exercise_row.exercise_id,
      exercise_row.exercise_order,
      jsonb_array_length(exercise_row.sets),
      exercise_row.target_reps_min,
      exercise_row.target_reps_max,
      exercise_row.target_weight_kg,
      exercise_row.rest_seconds,
      exercise_row.superset_group_id,
      exercise_row.notes
    )
    on conflict (id) do update set
      exercise_id = excluded.exercise_id,
      exercise_order = excluded.exercise_order,
      planned_sets = excluded.planned_sets,
      target_reps_min = excluded.target_reps_min,
      target_reps_max = excluded.target_reps_max,
      target_weight_kg = excluded.target_weight_kg,
      rest_seconds = excluded.rest_seconds,
      superset_group_id = excluded.superset_group_id,
      notes = excluded.notes;

    snapshot_set_ids := array[]::uuid[];

    for set_row in
      select *
      from jsonb_to_recordset(exercise_row.sets) as item(
        id uuid,
        set_number integer,
        weight_kg numeric,
        reps integer,
        rpe numeric,
        completed boolean,
        note text
      )
    loop
      insert into public.session_sets (
        id,
        user_id,
        session_id,
        session_exercise_id,
        set_number,
        weight_kg,
        reps,
        rpe,
        completed,
        note
      ) values (
        set_row.id,
        current_user_id,
        p_session_id,
        exercise_row.id,
        set_row.set_number,
        set_row.weight_kg,
        set_row.reps,
        set_row.rpe,
        set_row.completed,
        set_row.note
      )
      on conflict (id) do update set
        session_exercise_id = excluded.session_exercise_id,
        set_number = excluded.set_number,
        weight_kg = excluded.weight_kg,
        reps = excluded.reps,
        rpe = excluded.rpe,
        completed = excluded.completed,
        note = excluded.note;

      snapshot_set_ids := array_append(snapshot_set_ids, set_row.id);
    end loop;

    delete from public.session_sets
    where user_id = current_user_id
      and session_id = p_session_id
      and session_exercise_id = exercise_row.id
      and not (id = any(snapshot_set_ids));
  end loop;

  if exists (
    select 1
    from public.session_exercises
    where user_id = current_user_id
      and session_id = p_session_id
      and superset_group_id is not null
    group by superset_group_id
    having count(*) <> 2
      or max(exercise_order) - min(exercise_order) <> 1
      or max(planned_sets) <> min(planned_sets)
      or max(rest_seconds) <> min(rest_seconds)
  ) then
    raise exception 'Supersets must be adjacent pairs with matching sets and rest.';
  end if;

  update public.workout_sessions
  set performed_at = p_performed_at,
      notes = p_notes
  where id = p_session_id
    and user_id = current_user_id
  returning updated_at into synced_at;

  return synced_at;
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
  used_exercise_ids uuid[] := array[]::uuid[];
  used_group_ids uuid[] := array[]::uuid[];
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
