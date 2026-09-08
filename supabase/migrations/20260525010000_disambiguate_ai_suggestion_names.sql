with renamed_suggestions as (
  update public.workout_suggestions
  set name = case mod(get_byte(uuid_send(id), 0), 8)
    when 0 then 'Aurora Ascent'
    when 1 then 'Emerald Horizon'
    when 2 then 'Golden Summit'
    when 3 then 'Moonlit Momentum'
    when 4 then 'Silver Dawn'
    when 5 then 'Velvet Horizon'
    when 6 then 'Quiet Ascent'
    else 'Radiant Summit'
  end
  where lower(trim(name)) in ('workout a', 'workout b', 'workout c')
  returning id, name
)
update public.workout_sessions as session
set name = suggestion.name
from renamed_suggestions as suggestion
where session.source_suggestion_id = suggestion.id
  and lower(trim(session.name)) in ('workout a', 'workout b', 'workout c');
