-- Remove indexes identified as unused by Supabase performance advisor.
-- This migration is intentionally followed by FK index restoration below because FK coverage
-- is a separate performance requirement.
DROP INDEX IF EXISTS public.visitor_exits_pass_idx;
DROP INDEX IF EXISTS public.visitors_name_idx;
DROP INDEX IF EXISTS public.visitors_company_idx;
DROP INDEX IF EXISTS public.key_returns_key_number_idx;
DROP INDEX IF EXISTS public.package_registrations_recipient_idx;
DROP INDEX IF EXISTS public.visitors_phone_normalized_idx;
DROP INDEX IF EXISTS public.package_distributions_security_idx;
DROP INDEX IF EXISTS public.package_distributions_package_number_idx;
DROP INDEX IF EXISTS public.visitor_exits_visitor_id_idx;
DROP INDEX IF EXISTS public.idx_key_assets_active;
DROP INDEX IF EXISTS public.app_settings_updated_by_idx;
DROP INDEX IF EXISTS public.visitor_entries_exit_id_idx;
