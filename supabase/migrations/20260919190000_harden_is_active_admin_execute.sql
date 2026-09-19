-- Harden SECURITY DEFINER function execution
-- Keep function callable only by authenticated application users and service_role.

REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM anon;

GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO service_role;
