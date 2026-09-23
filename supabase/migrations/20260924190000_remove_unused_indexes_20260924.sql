-- Remove indexes currently confirmed unused by Supabase Performance Advisor.
-- FK covering indexes are restored by the following migration because they are
-- structurally useful even when current workload has not scanned them.
drop index if exists public.idx_emergency_recipients_group;
drop index if exists public.idx_emergency_updates_created_by;
drop index if exists public.idx_emergency_incidents_created_by;
drop index if exists public.idx_emergency_incidents_type;
drop index if exists public.idx_emergency_notifications_recipient;
drop index if exists public.idx_emergency_notifications_group;
drop index if exists public.idx_emergency_types_priority;
drop index if exists public.idx_emergency_settings_updated_by;
drop index if exists public.app_settings_updated_by_idx;
drop index if exists public.visitor_entries_exit_id_idx;
drop index if exists public.visitor_exits_visitor_id_idx;
drop index if exists public.idx_emergency_incidents_status_created;
drop index if exists public.idx_emergency_incident_recipients_incident;
drop index if exists public.idx_emergency_notifications_status;