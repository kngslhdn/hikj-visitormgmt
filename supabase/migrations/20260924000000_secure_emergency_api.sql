-- P1 security hardening for the Emergency API.
-- Apply after validating the SecureOps feature branch against the current production schema.

begin;

-- Emergency data is accessed through the authenticated Edge Function.
-- Keep direct browser access read-only for active admin users.
do $$
declare
  t text;
begin
  foreach t in array array[
    'emergency_acknowledgements',
    'emergency_contact_groups',
    'emergency_contacts',
    'emergency_group_members',
    'emergency_incident_recipients',
    'emergency_incident_types',
    'emergency_incident_updates',
    'emergency_incidents',
    'emergency_message_templates',
    'emergency_notifications',
    'emergency_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'emergency_' || replace(t, 'emergency_', '') || '_admin', t);
  end loop;
end $$;

create policy emergency_ack_select
  on public.emergency_acknowledgements
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_groups_select
  on public.emergency_contact_groups
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_contacts_select
  on public.emergency_contacts
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_members_select
  on public.emergency_group_members
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_recipients_select
  on public.emergency_incident_recipients
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_types_select
  on public.emergency_incident_types
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_updates_select
  on public.emergency_incident_updates
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_incidents_select
  on public.emergency_incidents
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_templates_select
  on public.emergency_message_templates
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_notifications_select
  on public.emergency_notifications
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

create policy emergency_settings_select
  on public.emergency_settings
  for select to authenticated
  using (exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.active = true
  ));

-- SMTP Vault helpers are server-only APIs. Do not expose them as public functions.
revoke all on function public.emergency_get_smtp_secret(text) from public, anon, authenticated;
grant execute on function public.emergency_get_smtp_secret(text) to service_role;

revoke all on function public.emergency_set_smtp_secret(text, text) from public, anon, authenticated;
grant execute on function public.emergency_set_smtp_secret(text, text) to service_role;

commit;
