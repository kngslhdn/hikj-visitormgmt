-- HIKJ Visitor Management - security and schema hardening
-- Reconciles production security state with the repository.

BEGIN;

-- Remove duplicate trigger; retain canonical expected-return trigger.
DROP TRIGGER IF EXISTS trg_set_key_expected_return_at ON public.key_borrowings;

-- Remove the exposed SECURITY DEFINER helper.
-- Authorization is expressed directly in RLS policies to avoid an executable
-- SECURITY DEFINER function in the public schema.
DROP POLICY IF EXISTS admin_profiles_self_select ON public.admin_profiles;
DROP POLICY IF EXISTS visitors_admin_select ON public.visitors;
DROP POLICY IF EXISTS submissions_admin_select ON public.submissions;
DROP POLICY IF EXISTS visitor_entries_admin_select ON public.visitor_entries;
DROP POLICY IF EXISTS visitor_exits_admin_select ON public.visitor_exits;
DROP POLICY IF EXISTS key_borrowings_admin_select ON public.key_borrowings;
DROP POLICY IF EXISTS key_returns_admin_select ON public.key_returns;
DROP POLICY IF EXISTS package_registrations_admin_select ON public.package_registrations;
DROP POLICY IF EXISTS package_distributions_admin_select ON public.package_distributions;
DROP POLICY IF EXISTS app_settings_admin_select ON public.app_settings;
DROP POLICY IF EXISTS key_assets_admin_select ON public.key_assets;
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;

REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.is_active_admin();

-- Active admin read access.
CREATE POLICY admin_profiles_self_select
ON public.admin_profiles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND active = true);

CREATE POLICY visitors_admin_select
ON public.visitors
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY submissions_admin_select
ON public.submissions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY visitor_entries_admin_select
ON public.visitor_entries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY visitor_exits_admin_select
ON public.visitor_exits
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY key_borrowings_admin_select
ON public.key_borrowings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY key_returns_admin_select
ON public.key_returns
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY package_registrations_admin_select
ON public.package_registrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY package_distributions_admin_select
ON public.package_distributions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY app_settings_admin_select
ON public.app_settings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY key_assets_admin_select
ON public.key_assets
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

CREATE POLICY audit_logs_admin_select
ON public.audit_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = (SELECT auth.uid())
      AND ap.active = true
      AND upper(ap.role::text) IN ('ADMIN','MANAGER','SUPERADMIN')
  )
);

-- Foreign-key covering indexes.
CREATE INDEX IF NOT EXISTS app_settings_updated_by_idx
  ON public.app_settings(updated_by);

CREATE INDEX IF NOT EXISTS visitor_entries_exit_id_idx
  ON public.visitor_entries(exit_id);

CREATE INDEX IF NOT EXISTS visitor_exits_visitor_id_idx
  ON public.visitor_exits(visitor_id);

-- Reporting views must respect underlying-table RLS.
ALTER VIEW public.currently_inside SET (security_invoker = true);
ALTER VIEW public.key_control_transactions SET (security_invoker = true);
ALTER VIEW public.key_return_events SET (security_invoker = true);
ALTER VIEW public.outstanding_keys SET (security_invoker = true);
ALTER VIEW public.package_distribution_history SET (security_invoker = true);
ALTER VIEW public.recent_activity SET (security_invoker = true);

-- Redundant duplicate of the primary-key index.
DROP INDEX IF EXISTS public.idx_app_settings_key;

COMMIT;
