alter table public.exercises
  add column is_ai_suggestion_enabled boolean not null default false;

update public.exercises e
set is_ai_suggestion_enabled = true
where e.source in ('nextset_starter', 'manual')
   or exists (
     select 1
     from public.workout_template_exercises wte
     where wte.exercise_id = e.id
   )
   or exists (
     select 1
     from public.session_exercises se
     where se.exercise_id = e.id
   );

insert into public.exercises (
  user_id,
  name,
  primary_muscle_group,
  secondary_muscle_groups,
  equipment,
  lift_category,
  default_increment_kg,
  is_main_lift,
  is_ai_suggestion_enabled,
  notes,
  source,
  source_id,
  source_license,
  source_payload
)
select
  p.id,
  staple.name,
  staple.primary_muscle_group,
  '{}'::text[],
  staple.equipment,
  'accessory',
  staple.default_increment_kg,
  false,
  true,
  null,
  'nextset_starter',
  staple.source_id,
  'NextSet starter data',
  jsonb_build_object(
    'name', staple.name,
    'primaryMuscleGroup', staple.primary_muscle_group,
    'secondaryMuscleGroups', jsonb_build_array(),
    'equipment', staple.equipment,
    'liftCategory', 'accessory',
    'defaultIncrementKg', staple.default_increment_kg,
    'isMainLift', false,
    'notes', null
  )
from public.profiles p
cross join (
  values
    ('Dumbbell Curl', 'biceps', 'dumbbell', 1::numeric, 'dumbbell-curl'),
    ('Cable Triceps Pushdown', 'triceps', 'cable', 2.5::numeric, 'cable-triceps-pushdown')
) as staple(name, primary_muscle_group, equipment, default_increment_kg, source_id)
where not exists (
  select 1
  from public.exercises existing
  where existing.user_id = p.id
    and lower(existing.name) = lower(staple.name)
);

update public.exercises
set is_ai_suggestion_enabled = true
where lower(name) in ('dumbbell curl', 'cable triceps pushdown');
