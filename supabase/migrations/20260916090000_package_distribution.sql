-- HIKJ Visitor Management - Package Distribution
-- Distribution is an immutable audit record linked to the original package registration.

CREATE TABLE IF NOT EXISTS public.package_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_registration_id uuid NOT NULL REFERENCES public.package_registrations(id) ON DELETE RESTRICT,
  package_number text NOT NULL,
  registered_recipient_name text,
  recipient_name text NOT NULL,
  security_hand_over text NOT NULL,
  distributed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'DISTRIBUTED' CHECK (status IN ('DISTRIBUTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS package_distributions_package_registration_unique
  ON public.package_distributions(package_registration_id);

CREATE INDEX IF NOT EXISTS package_distributions_distributed_at_idx
  ON public.package_distributions(distributed_at DESC);

CREATE INDEX IF NOT EXISTS package_distributions_security_idx
  ON public.package_distributions(lower(security_hand_over));

CREATE INDEX IF NOT EXISTS package_distributions_package_number_idx
  ON public.package_distributions(lower(package_number));

ALTER TABLE public.package_distributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.package_distributions FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.package_distributions TO service_role;

-- Public/search clients must not write distribution rows directly.
-- All writes are performed by the package-distribution Edge Function after
-- authenticated admin/security validation and duplicate protection.

CREATE OR REPLACE VIEW public.package_distribution_history AS
SELECT
  d.id,
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
  p.created_at AS registered_at
FROM public.package_distributions d
JOIN public.package_registrations p ON p.id = d.package_registration_id;

REVOKE ALL ON public.package_distribution_history FROM anon, authenticated;
GRANT SELECT ON public.package_distribution_history TO service_role;
