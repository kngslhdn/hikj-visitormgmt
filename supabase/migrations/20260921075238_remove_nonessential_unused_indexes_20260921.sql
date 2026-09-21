-- Remove remaining non-essential indexes reported as unused.
-- FK covering indexes are intentionally retained.
DROP INDEX IF EXISTS public.visitor_exits_pass_idx;
DROP INDEX IF EXISTS public.visitors_name_idx;
DROP INDEX IF EXISTS public.visitors_company_idx;
DROP INDEX IF EXISTS public.key_returns_key_number_idx;
DROP INDEX IF EXISTS public.package_registrations_recipient_idx;
DROP INDEX IF EXISTS public.visitors_phone_normalized_idx;
DROP INDEX IF EXISTS public.package_distributions_security_idx;
DROP INDEX IF EXISTS public.package_distributions_package_number_idx;
DROP INDEX IF EXISTS public.idx_key_assets_active;
