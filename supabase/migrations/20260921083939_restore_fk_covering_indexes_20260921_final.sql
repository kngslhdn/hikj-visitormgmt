create index if not exists public.app_settings_updated_by_idx on public.app_settings (updated_by);
create index if not exists public.visitor_entries_exit_id_idx on public.visitor_entries (exit_id);
create index if not exists public.visitor_exits_visitor_id_idx on public.visitor_exits (visitor_id);
