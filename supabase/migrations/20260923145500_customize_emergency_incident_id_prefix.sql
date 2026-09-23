create or replace function public.set_emergency_incident_id()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  configured_prefix text;
begin
  if new.incident_id is null then
    select coalesce(setting_value #>> '{}', 'HIKJ-INC')
      into configured_prefix
    from public.emergency_settings
    where setting_key = 'incident_id_prefix'
      and active = true
    limit 1;

    configured_prefix := coalesce(nullif(configured_prefix,''),'HIKJ-INC');
    new.incident_id := configured_prefix || '-' || to_char(new.created_at,'YYYY') || '-' || lpad(new.incident_number::text,6,'0');
  end if;
  return new;
end;
$function$;
