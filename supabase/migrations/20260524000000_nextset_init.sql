create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  week_start_day integer not null default 0 check (week_start_day between 0 and 6),
  weekly_workout_target integer not null default 3 check (weekly_workout_target between 1 and 14),
  weight_unit text not null default 'kg' check (weight_unit in ('kg')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  primary_muscle_group text not null,
  secondary_muscle_groups text[] not null default '{}',
  equipment text,
  lift_category text not null default 'other' check (
    lift_category in (
      'barbell_upper',
      'dumbbell_upper',
      'lower_compound',
      'machine',
      'bodyweight',
      'accessory',
      'core',
      'conditioning',
      'other'
    )
  ),
  default_increment_kg numeric(6, 2) not null default 2.5 check (default_increment_kg >= 0),
  is_main_lift boolean not null default false,
  notes text,
  source text,
  source_id text,
  source_url text,
  source_license text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_order integer not null,
  target_sets integer not null check (target_sets between 1 and 12),
  target_reps_min integer not null check (target_reps_min between 1 and 100),
  target_reps_max integer not null check (target_reps_max between 1 and 100),
  target_weight_kg numeric(7, 2) check (target_weight_kg is null or target_weight_kg >= 0),
  target_set_weights_kg jsonb not null default '[]'::jsonb,
  rest_seconds integer not null default 120 check (rest_seconds between 0 and 900),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_template_exercises_rep_range check (target_reps_max >= target_reps_min),
  constraint workout_template_exercises_set_weights_shape check (
    jsonb_typeof(target_set_weights_kg) = 'array'
    and jsonb_array_length(target_set_weights_kg) <= 12
  )
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  source_suggestion_id uuid,
  name text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_order integer not null,
  planned_sets integer not null check (planned_sets between 1 and 12),
  target_reps_min integer not null check (target_reps_min between 1 and 100),
  target_reps_max integer not null check (target_reps_max between 1 and 100),
  target_weight_kg numeric(7, 2) check (target_weight_kg is null or target_weight_kg >= 0),
  rest_seconds integer not null default 120 check (rest_seconds between 0 and 900),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_exercises_rep_range check (target_reps_max >= target_reps_min)
);

create table public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number integer not null check (set_number between 1 and 20),
  weight_kg numeric(7, 2) not null default 0 check (weight_kg >= 0),
  reps integer not null default 0 check (reps between 0 and 200),
  rpe numeric(3, 1) check (rpe is null or (rpe >= 1 and rpe <= 10)),
  completed boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  provider text not null,
  model text not null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  summary text not null,
  raw_json jsonb not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_exercise_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.ai_reviews(id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  exercise_name text not null,
  decision text not null check (decision in ('increase', 'stay', 'reduce', 'adjust_reps', 'watch_pain')),
  reason text not null,
  suggested_sets integer not null check (suggested_sets between 1 and 12),
  suggested_reps_min integer not null check (suggested_reps_min between 1 and 100),
  suggested_reps_max integer not null check (suggested_reps_max between 1 and 100),
  suggested_weight_kg numeric(7, 2) check (suggested_weight_kg is null or suggested_weight_kg >= 0),
  suggested_rest_seconds integer not null default 120 check (suggested_rest_seconds between 0 and 900),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_exercise_decisions_rep_range check (suggested_reps_max >= suggested_reps_min)
);

create table public.workout_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  source_template_id uuid references public.workout_templates(id) on delete set null,
  name text not null,
  rationale text,
  weekly_balance_notes text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'accepted', 'ignored', 'used')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_sessions
  add constraint workout_sessions_source_suggestion_id_fkey
  foreign key (source_suggestion_id) references public.workout_suggestions(id) on delete set null;

create table public.workout_suggestion_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_id uuid not null references public.workout_suggestions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_order integer not null,
  target_sets integer not null check (target_sets between 1 and 12),
  target_reps_min integer not null check (target_reps_min between 1 and 100),
  target_reps_max integer not null check (target_reps_max between 1 and 100),
  target_weight_kg numeric(7, 2) check (target_weight_kg is null or target_weight_kg >= 0),
  rest_seconds integer not null default 120 check (rest_seconds between 0 and 900),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_suggestion_exercises_rep_range check (target_reps_max >= target_reps_min)
);

create unique index exercises_user_lower_name_key on public.exercises (user_id, lower(name));
create unique index exercises_user_source_key on public.exercises (user_id, source, source_id)
  where source is not null and source_id is not null;
create unique index workout_templates_user_lower_name_key on public.workout_templates (user_id, lower(name));
create index exercises_user_muscle_idx on public.exercises (user_id, primary_muscle_group);
create index workout_templates_user_order_idx on public.workout_templates (user_id, sort_order);
create index workout_template_exercises_template_idx on public.workout_template_exercises (template_id, exercise_order);
create index workout_template_exercises_user_template_idx on public.workout_template_exercises (user_id, template_id);
create index workout_template_exercises_exercise_idx on public.workout_template_exercises (exercise_id);
create index workout_sessions_user_finished_idx on public.workout_sessions (user_id, finished_at desc);
create index workout_sessions_user_status_idx on public.workout_sessions (user_id, status);
create index session_exercises_session_idx on public.session_exercises (session_id, exercise_order);
create index session_exercises_user_exercise_idx on public.session_exercises (user_id, exercise_id);
create index session_sets_session_idx on public.session_sets (session_id);
create index session_sets_exercise_idx on public.session_sets (session_exercise_id, set_number);
create index session_sets_user_exercise_session_idx on public.session_sets (user_id, session_exercise_id, created_at);
create unique index ai_reviews_session_key on public.ai_reviews (session_id);
create index ai_exercise_decisions_review_idx on public.ai_exercise_decisions (review_id);
create index workout_suggestions_user_status_idx on public.workout_suggestions (user_id, status, created_at desc);
create index workout_suggestion_exercises_suggestion_idx on public.workout_suggestion_exercises (suggestion_id, exercise_order);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger exercises_set_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();
create trigger workout_templates_set_updated_at before update on public.workout_templates
  for each row execute function public.set_updated_at();
create trigger workout_template_exercises_set_updated_at before update on public.workout_template_exercises
  for each row execute function public.set_updated_at();
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
  for each row execute function public.set_updated_at();
create trigger session_exercises_set_updated_at before update on public.session_exercises
  for each row execute function public.set_updated_at();
create trigger session_sets_set_updated_at before update on public.session_sets
  for each row execute function public.set_updated_at();
create trigger ai_reviews_set_updated_at before update on public.ai_reviews
  for each row execute function public.set_updated_at();
create trigger ai_exercise_decisions_set_updated_at before update on public.ai_exercise_decisions
  for each row execute function public.set_updated_at();
create trigger workout_suggestions_set_updated_at before update on public.workout_suggestions
  for each row execute function public.set_updated_at();
create trigger workout_suggestion_exercises_set_updated_at before update on public.workout_suggestion_exercises
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data->>'name')
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.session_sets enable row level security;
alter table public.ai_reviews enable row level security;
alter table public.ai_exercise_decisions enable row level security;
alter table public.workout_suggestions enable row level security;
alter table public.workout_suggestion_exercises enable row level security;

create policy profiles_user_policy on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy exercises_user_policy on public.exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workout_templates_user_policy on public.workout_templates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workout_template_exercises_user_policy on public.workout_template_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workout_sessions_user_policy on public.workout_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy session_exercises_user_policy on public.session_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy session_sets_user_policy on public.session_sets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy ai_reviews_user_policy on public.ai_reviews
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy ai_exercise_decisions_user_policy on public.ai_exercise_decisions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workout_suggestions_user_policy on public.workout_suggestions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy workout_suggestion_exercises_user_policy on public.workout_suggestion_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
