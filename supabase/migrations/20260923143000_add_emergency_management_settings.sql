-- Emergency Management customization layer
alter table public.emergency_incident_types
  add column if not exists description text,
  add column if not exists default_severity text not null default 'URGENT',
  add column if not exists priority integer not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'emergency_incident_types_default_severity_chk'
  ) then
    alter table public.emergency_incident_types
      add constraint emergency_incident_types_default_severity_chk
      check (default_severity = any (array['URGENT','HIGH','NORMAL','INFORMATION']));
  end if;
end $$;

create table if not exists public.emergency_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  description text,
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emergency_settings_active
  on public.emergency_settings(active, setting_key);

alter table public.emergency_settings enable row level security;

drop policy if exists emergency_settings_admin on public.emergency_settings;
create policy emergency_settings_admin
  on public.emergency_settings
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid())
        and p.active = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid())
        and p.active = true
    )
  );

insert into public.emergency_settings (setting_key, setting_value, description)
values
  ('default_severity', '"URGENT"', 'Default incident severity'),
  ('default_incident_type_code', '"FIRE"', 'Default incident type code'),
  ('default_location', '"Ground Floor"', 'Default incident location'),
  ('timezone', '"Asia/Jakarta"', 'Emergency system timezone'),
  ('incident_id_prefix', '"HIKJ-INC"', 'Incident ID prefix'),
  ('production_enabled', 'true', 'Allow production emergency mode'),
  ('require_production_confirmation', 'true', 'Require explicit production confirmation'),
  ('require_recipient_selection', 'true', 'Require at least one recipient'),
  ('notification_retry_count', '0', 'Reserved notification retry count'),
  ('acknowledgement_timeout_minutes', '15', 'Acknowledgement timeout in minutes'),
  ('auto_refresh_seconds', '30', 'Dashboard auto-refresh interval in seconds'),
  ('retention_days', '365', 'Operational retention setting')
on conflict (setting_key) do nothing;

create index if not exists idx_emergency_types_priority
  on public.emergency_incident_types(active, priority, name);
