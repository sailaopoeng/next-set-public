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
  snapshot_exercise_ids uuid[] := '{}';
  snapshot_library_ids uuid[] := '{}';
  snapshot_set_ids uuid[];
  all_set_ids uuid[] := '{}';
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
    snapshot_set_ids := '{}';
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

    snapshot_set_ids := '{}';

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

create or replace function public.create_workout_session_snapshot(
  p_session_id uuid,
  p_template_id uuid,
  p_source_suggestion_id uuid,
  p_name text,
  p_notes text,
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

  if p_name is null or length(trim(p_name)) not between 1 and 80 then
    raise exception 'Workout name is invalid.';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.workout_templates
    where id = p_template_id and user_id = current_user_id
  ) then
    raise exception 'Workout template not found.';
  end if;

  if p_source_suggestion_id is not null and not exists (
    select 1 from public.workout_suggestions
    where id = p_source_suggestion_id and user_id = current_user_id
  ) then
    raise exception 'Workout suggestion not found.';
  end if;

  insert into public.workout_sessions (
    id,
    user_id,
    template_id,
    source_suggestion_id,
    name,
    status,
    notes
  ) values (
    p_session_id,
    current_user_id,
    p_template_id,
    p_source_suggestion_id,
    trim(p_name),
    'active',
    p_notes
  );

  perform public.sync_live_session(
    p_session_id,
    now(),
    p_notes,
    p_exercises
  );

  if p_source_suggestion_id is not null then
    update public.workout_suggestions
    set status = 'used'
    where id = p_source_suggestion_id
      and user_id = current_user_id;
  end if;
end;
$$;

create or replace function public.complete_workout_session(
  p_session_id uuid,
  p_performed_at timestamptz,
  p_notes text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
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
    raise exception 'Cancelled workouts cannot be completed.';
  end if;

  if current_status = 'completed' then
    return false;
  end if;

  if not exists (
    select 1
    from public.session_exercises
    where session_id = p_session_id
      and user_id = current_user_id
  ) then
    raise exception 'Add at least one exercise before finishing this workout.';
  end if;

  update public.workout_sessions
  set status = 'completed',
      performed_at = p_performed_at,
      finished_at = now(),
      notes = p_notes
  where id = p_session_id
    and user_id = current_user_id;

  return true;
end;
$$;

with ranked_suggestions as (
  select
    id,
    row_number() over (
      partition by source_session_id
      order by
        case status when 'used' then 3 when 'accepted' then 2 else 1 end desc,
        created_at desc,
        id desc
    ) as duplicate_rank
  from public.workout_suggestions
  where source_session_id is not null
)
delete from public.workout_suggestions as suggestion
using ranked_suggestions as ranked
where suggestion.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists workout_suggestions_source_session_key
  on public.workout_suggestions (source_session_id);

delete from public.ai_exercise_decisions as older
using public.ai_exercise_decisions as newer
where older.review_id = newer.review_id
  and older.session_exercise_id = newer.session_exercise_id
  and older.id < newer.id;

create unique index if not exists ai_exercise_decisions_review_exercise_key
  on public.ai_exercise_decisions (review_id, session_exercise_id);

create or replace function public.save_session_review(
  p_session_id uuid,
  p_provider text,
  p_model text,
  p_summary text,
  p_raw_json jsonb,
  p_decisions jsonb,
  p_suggestion jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  v_review_id uuid;
  v_suggestion_id uuid;
  existing_suggestion_id uuid;
  existing_suggestion_status text;
  inserted_decision_count integer;
  inserted_exercise_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  if not exists (
    select 1
    from public.workout_sessions
    where id = p_session_id
      and user_id = current_user_id
      and status = 'completed'
  ) then
    raise exception 'Completed workout session not found.';
  end if;

  if jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'Review decisions must be an array.';
  end if;

  insert into public.ai_reviews (
    user_id,
    session_id,
    provider,
    model,
    status,
    summary,
    raw_json,
    error_message
  ) values (
    current_user_id,
    p_session_id,
    p_provider,
    p_model,
    'completed',
    p_summary,
    p_raw_json,
    null
  )
  on conflict (session_id) do update set
    provider = excluded.provider,
    model = excluded.model,
    status = excluded.status,
    summary = excluded.summary,
    raw_json = excluded.raw_json,
    error_message = null
  returning id into v_review_id;

  delete from public.ai_exercise_decisions
  where user_id = current_user_id
    and review_id = v_review_id;

  insert into public.ai_exercise_decisions (
    user_id,
    review_id,
    session_exercise_id,
    exercise_name,
    decision,
    reason,
    suggested_sets,
    suggested_reps_min,
    suggested_reps_max,
    suggested_weight_kg,
    suggested_rest_seconds,
    notes
  )
  select
    current_user_id,
    v_review_id,
    item.session_exercise_id,
    item.exercise_name,
    item.decision,
    item.reason,
    item.suggested_sets,
    item.suggested_reps_min,
    item.suggested_reps_max,
    item.suggested_weight_kg,
    item.suggested_rest_seconds,
    item.notes
  from jsonb_to_recordset(p_decisions) as item(
    session_exercise_id uuid,
    exercise_name text,
    decision text,
    reason text,
    suggested_sets integer,
    suggested_reps_min integer,
    suggested_reps_max integer,
    suggested_weight_kg numeric,
    suggested_rest_seconds integer,
    notes text
  )
  join public.session_exercises as session_exercise
    on session_exercise.id = item.session_exercise_id
   and session_exercise.session_id = p_session_id
   and session_exercise.user_id = current_user_id;

  get diagnostics inserted_decision_count = row_count;
  if inserted_decision_count <> jsonb_array_length(p_decisions) then
    raise exception 'Review decision does not belong to this workout.';
  end if;

  select id, status
  into existing_suggestion_id, existing_suggestion_status
  from public.workout_suggestions
  where source_session_id = p_session_id
    and user_id = current_user_id
  for update;

  if existing_suggestion_status in ('accepted', 'used') then
    return;
  end if;

  if existing_suggestion_id is not null then
    delete from public.workout_suggestions
    where id = existing_suggestion_id
      and user_id = current_user_id;
  end if;

  if p_suggestion is null or p_suggestion = 'null'::jsonb then
    return;
  end if;

  v_suggestion_id := gen_random_uuid();
  insert into public.workout_suggestions (
    id,
    user_id,
    source_session_id,
    source_template_id,
    name,
    rationale,
    weekly_balance_notes,
    estimated_duration_minutes,
    target_session_type,
    status
  ) values (
    v_suggestion_id,
    current_user_id,
    p_session_id,
    nullif(p_suggestion->>'source_template_id', '')::uuid,
    p_suggestion->>'name',
    nullif(p_suggestion->>'rationale', ''),
    array(select jsonb_array_elements_text(coalesce(p_suggestion->'weekly_balance_notes', '[]'::jsonb))),
    (p_suggestion->>'estimated_duration_minutes')::integer,
    p_suggestion->>'target_session_type',
    'draft'
  );

  insert into public.workout_suggestion_exercises (
    user_id,
    suggestion_id,
    exercise_id,
    exercise_order,
    target_sets,
    target_reps_min,
    target_reps_max,
    target_weight_kg,
    rest_seconds,
    notes
  )
  select
    current_user_id,
    v_suggestion_id,
    item.exercise_id,
    item.exercise_order,
    item.target_sets,
    item.target_reps_min,
    item.target_reps_max,
    item.target_weight_kg,
    item.rest_seconds,
    item.notes
  from jsonb_to_recordset(p_suggestion->'exercises') as item(
    exercise_id uuid,
    exercise_order integer,
    target_sets integer,
    target_reps_min integer,
    target_reps_max integer,
    target_weight_kg numeric,
    rest_seconds integer,
    notes text
  )
  join public.exercises as exercise
    on exercise.id = item.exercise_id
   and exercise.user_id = current_user_id;

  get diagnostics inserted_exercise_count = row_count;
  if inserted_exercise_count <> jsonb_array_length(p_suggestion->'exercises') then
    raise exception 'Suggestion exercise does not belong to this user.';
  end if;
end;
$$;
