-- ============================================================
-- HIKJ Visitor Management - Admin Dashboard RLS
-- ============================================================
-- Allows authenticated admin users to read operational data.
-- The service-role key is NEVER used in the browser.
-- ============================================================

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and active = true
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated;

-- Authenticated admins need SELECT privileges; RLS still limits rows.
grant select on public.admin_profiles to authenticated;
grant select on public.visitors to authenticated;
grant select on public.submissions to authenticated;
grant select on public.visitor_entries to authenticated;
grant select on public.visitor_exits to authenticated;
grant select on public.key_borrowings to authenticated;
grant select on public.key_returns to authenticated;
grant select on public.package_registrations to authenticated;
grant select on public.currently_inside to authenticated;
grant select on public.outstanding_keys to authenticated;
grant select on public.recent_activity to authenticated;

-- Admin profile: a signed-in user can read only their own profile.
drop policy if exists admin_profiles_self_select on public.admin_profiles;
create policy admin_profiles_self_select
on public.admin_profiles
for select to authenticated
using (user_id = auth.uid() and active = true);

-- Operational tables: active admins can read reporting data.
drop policy if exists visitors_admin_select on public.visitors;
create policy visitors_admin_select
on public.visitors
for select to authenticated
using (public.is_active_admin());

drop policy if exists submissions_admin_select on public.submissions;
create policy submissions_admin_select
on public.submissions
for select to authenticated
using (public.is_active_admin());

drop policy if exists visitor_entries_admin_select on public.visitor_entries;
create policy visitor_entries_admin_select
on public.visitor_entries
for select to authenticated
using (public.is_active_admin());

drop policy if exists visitor_exits_admin_select on public.visitor_exits;
create policy visitor_exits_admin_select
on public.visitor_exits
for select to authenticated
using (public.is_active_admin());

drop policy if exists key_borrowings_admin_select on public.key_borrowings;
create policy key_borrowings_admin_select
on public.key_borrowings
for select to authenticated
using (public.is_active_admin());

drop policy if exists key_returns_admin_select on public.key_returns;
create policy key_returns_admin_select
on public.key_returns
for select to authenticated
using (public.is_active_admin());

drop policy if exists package_registrations_admin_select on public.package_registrations;
create policy package_registrations_admin_select
on public.package_registrations
for select to authenticated
using (public.is_active_admin());

-- Views inherit access from their underlying tables, but explicit grants
-- make the dashboard API contract clear.
-- No anonymous SELECT access is granted.

comment on function public.is_active_admin() is
  'Returns true only for authenticated users with an active admin_profiles record.';
