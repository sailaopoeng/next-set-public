alter table public.exercises
  add column if not exists volume_multiplier smallint not null default 1;

alter table public.exercises
  drop constraint if exists exercises_volume_multiplier_check;

alter table public.exercises
  add constraint exercises_volume_multiplier_check
  check (volume_multiplier in (1, 2));
