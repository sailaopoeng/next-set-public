alter table public.profiles
  add column weekly_muscle_targets jsonb not null default '{
    "chest": {"minimum": 8, "maximum": 12},
    "back": {"minimum": 10, "maximum": 14},
    "shoulders": {"minimum": 8, "maximum": 12},
    "quads": {"minimum": 8, "maximum": 12},
    "hamstrings": {"minimum": 6, "maximum": 10},
    "biceps": {"minimum": 4, "maximum": 8},
    "triceps": {"minimum": 4, "maximum": 8}
  }'::jsonb
  check (jsonb_typeof(weekly_muscle_targets) = 'object');

create table public.weekly_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  provider text not null,
  model text not null,
  analysis_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.deload_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  source text not null default 'manual' check (source in ('manual', 'ai_recommendation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index weekly_ai_analyses_user_week_idx
  on public.weekly_ai_analyses (user_id, week_start desc);
create index deload_weeks_user_week_idx
  on public.deload_weeks (user_id, week_start desc);

create trigger weekly_ai_analyses_set_updated_at before update on public.weekly_ai_analyses
  for each row execute function public.set_updated_at();
create trigger deload_weeks_set_updated_at before update on public.deload_weeks
  for each row execute function public.set_updated_at();

alter table public.weekly_ai_analyses enable row level security;
alter table public.deload_weeks enable row level security;

create policy weekly_ai_analyses_user_policy on public.weekly_ai_analyses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy deload_weeks_user_policy on public.deload_weeks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
