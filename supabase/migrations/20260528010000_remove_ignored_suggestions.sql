delete from public.workout_suggestions where status = 'ignored';

do $$
declare
    constraint_name text;
begin
    select con.conname into constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'workout_suggestions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%status%';

    if constraint_name is not null then
        execute format('alter table public.workout_suggestions drop constraint %I', constraint_name);
        execute format(
            'alter table public.workout_suggestions add constraint workout_suggestions_status_check check (status in (''draft'', ''accepted'', ''used''))'
        );
    end if;
end $$;
