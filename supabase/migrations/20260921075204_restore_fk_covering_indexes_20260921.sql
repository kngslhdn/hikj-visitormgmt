-- Retain covering indexes for foreign keys required by Supabase performance checks.
CREATE INDEX IF NOT EXISTS app_settings_updated_by_idx ON public.app_settings (updated_by);
CREATE INDEX IF NOT EXISTS visitor_entries_exit_id_idx ON public.visitor_entries (exit_id);
CREATE INDEX IF NOT EXISTS visitor_exits_visitor_id_idx ON public.visitor_exits (visitor_id);
