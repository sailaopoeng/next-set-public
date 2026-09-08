alter table public.workout_suggestions
  add column estimated_duration_minutes integer check (
    estimated_duration_minutes is null
    or estimated_duration_minutes between 1 and 180
  ),
  add column target_session_type text check (
    target_session_type is null
    or target_session_type in ('weekday', 'sunday')
  );
