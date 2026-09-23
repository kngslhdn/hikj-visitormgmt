-- Restore covering indexes for foreign keys.
-- These indexes remain intentionally even if the current workload has not
-- scanned them yet; Supabase Performance Advisor flags the foreign keys when
-- these covering indexes are absent.
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
create index if not exists idx_emergency_incident_recipients_incident on public.emergency_incident_recipients (incident_id);
create index if not exists idx_emergency_recipients_group on public.emergency_incident_recipients (group_id);
create index if not exists idx_emergency_updates_created_by on public.emergency_incident_updates (created_by);
create index if not exists idx_emergency_incidents_created_by on public.emergency_incidents (created_by);
create index if not exists idx_emergency_incidents_type on public.emergency_incidents (incident_type_id);
create index if not exists idx_emergency_notifications_group on public.emergency_notifications (group_id);
create index if not exists idx_emergency_notifications_recipient on public.emergency_notifications (recipient_id);
create index if not exists idx_emergency_settings_updated_by on public.emergency_settings (updated_by);
create index if not exists visitor_entries_exit_id_idx on public.visitor_entries (exit_id);
create index if not exists visitor_exits_visitor_id_idx on public.visitor_exits (visitor_id);