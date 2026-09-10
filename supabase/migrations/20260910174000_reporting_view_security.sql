-- ============================================================
-- HIKJ Visitor Management - Reporting View Security
-- ============================================================
-- Make reporting views obey the caller's RLS policies.
-- ============================================================

alter view public.currently_inside set (security_invoker = true);
alter view public.outstanding_keys set (security_invoker = true);
alter view public.recent_activity set (security_invoker = true);

grant select on public.currently_inside to authenticated;
grant select on public.outstanding_keys to authenticated;
grant select on public.recent_activity to authenticated;

-- Explicitly prevent anonymous dashboard reads.
revoke all on public.currently_inside from anon;
revoke all on public.outstanding_keys from anon;
revoke all on public.recent_activity from anon;
