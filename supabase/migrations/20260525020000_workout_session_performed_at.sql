alter table public.workout_sessions
  add column performed_at timestamptz;

update public.workout_sessions
set performed_at = coalesce(finished_at, started_at, now())
where performed_at is null;

alter table public.workout_sessions
  alter column performed_at set not null,
  alter column performed_at set default now();

create index if not exists workout_sessions_user_performed_idx
  on public.workout_sessions (user_id, performed_at desc);
