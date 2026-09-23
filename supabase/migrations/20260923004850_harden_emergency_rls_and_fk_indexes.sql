-- Emergency Notification System hardening
-- Source of truth: Supabase production project hmqgmusellcetakoalva
-- Migration: 20260923004850_harden_emergency_rls_and_fk_indexes

create index idx_emergency_ack_contact on public.emergency_acknowledgements (contact_id);
create index idx_emergency_group_members_contact on public.emergency_group_members (contact_id);
create index idx_emergency_incident_recipients_incident on public.emergency_incident_recipients (incident_id);
create index idx_emergency_recipients_contact on public.emergency_incident_recipients (contact_id);
create index idx_emergency_recipients_group on public.emergency_incident_recipients (group_id);
create index idx_emergency_updates_created_by on public.emergency_incident_updates (created_by);
create index idx_emergency_updates_incident on public.emergency_incident_updates (incident_id, created_at desc);
create index idx_emergency_incidents_created_by on public.emergency_incidents (created_by);
create index idx_emergency_incidents_status_created on public.emergency_incidents (status, created_at desc);
create index idx_emergency_incidents_type on public.emergency_incidents (incident_type_id);
create index idx_emergency_notifications_incident on public.emergency_notifications (incident_id);
create index idx_emergency_notifications_recipient on public.emergency_notifications (recipient_id);
create index idx_emergency_notifications_status on public.emergency_notifications (status);

alter table public.emergency_incident_types enable row level security;
alter table public.emergency_contact_groups enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.emergency_group_members enable row level security;
alter table public.emergency_incidents enable row level security;
alter table public.emergency_incident_recipients enable row level security;
alter table public.emergency_message_templates enable row level security;
alter table public.emergency_notifications enable row level security;
alter table public.emergency_incident_updates enable row level security;
alter table public.emergency_acknowledgements enable row level security;

create policy emergency_types_admin on public.emergency_incident_types as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_groups_admin on public.emergency_contact_groups as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_contacts_admin on public.emergency_contacts as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_members_admin on public.emergency_group_members as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_incidents_admin on public.emergency_incidents as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_recipients_admin on public.emergency_incident_recipients as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_templates_admin on public.emergency_message_templates as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_notifications_admin on public.emergency_notifications as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_updates_admin on public.emergency_incident_updates as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));

create policy emergency_ack_admin on public.emergency_acknowledgements as permissive for all to authenticated
using (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.admin_profiles p where p.user_id = (select auth.uid()) and p.active = true));
