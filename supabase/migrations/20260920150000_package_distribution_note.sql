-- HIKJ Visitor Management - Package Distribution Note
-- Optional operational note for recipient identification and hand-over placement.

ALTER TABLE public.package_distributions
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.package_distributions.note IS
  'Optional package hand-over note such as recipient department, pigeon hole location, or other identification information.';

CREATE OR REPLACE VIEW public.package_distribution_history AS
SELECT
  d.id,
  d.distribution_number,
  d.package_registration_id,
  d.package_number,
  d.registered_recipient_name,
  d.recipient_name,
  d.security_hand_over,
  d.distributed_at,
  d.status,
  d.created_at,
  p.company_name,
  p.courier_name,
  p.item_type,
  p.item_count,
  p.created_at AS registered_at,
  d.note
FROM public.package_distributions d
JOIN public.package_registrations p ON p.id = d.package_registration_id;

REVOKE ALL ON public.package_distribution_history FROM anon, authenticated;
GRANT SELECT ON public.package_distribution_history TO service_role;
