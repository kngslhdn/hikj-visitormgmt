-- Key Control V2: 24-hour expected return and dynamic outstanding status
-- BORROWED   = key still outstanding and within 24 hours.
-- OUTSTANDING = key still outstanding and past expected_return_at.
-- RETURNED   = borrowing quantity fully returned.
--
-- The expected return time is server-controlled from borrowed_at + 24 hours.
-- Existing borrowing rows are backfilled without changing historical borrowed_at.

ALTER TABLE public.key_borrowings
  ADD COLUMN IF NOT EXISTS expected_return_at timestamptz;

UPDATE public.key_borrowings
SET expected_return_at = borrowed_at + interval '24 hours'
WHERE expected_return_at IS NULL;

ALTER TABLE public.key_borrowings
  ALTER COLUMN expected_return_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_key_expected_return_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.expected_return_at := NEW.borrowed_at + interval '24 hours';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_key_expected_return_at ON public.key_borrowings;

CREATE TRIGGER trg_set_key_expected_return_at
BEFORE INSERT OR UPDATE OF borrowed_at ON public.key_borrowings
FOR EACH ROW
EXECUTE FUNCTION public.set_key_expected_return_at();

CREATE OR REPLACE VIEW public.key_control_transactions
WITH (security_invoker=true) AS
SELECT
  b.id AS borrowing_id,
  s.submission_id,
  b.borrower_name,
  b.department,
  b.key_number,
  b.key_description,
  b.quantity AS borrowed_quantity,
  coalesce(sum(r.quantity),0)::integer AS returned_quantity,
  greatest(b.quantity-coalesce(sum(r.quantity),0),0)::integer AS outstanding_quantity,
  max(r.returned_at) AS last_returned_at,
  b.security_officer_name AS issued_by_security,
  b.borrowed_at,
  b.expected_return_at,
  CASE
    WHEN greatest(b.quantity-coalesce(sum(r.quantity),0),0)=0 THEN 'RETURNED'
    WHEN now() > b.expected_return_at THEN 'OUTSTANDING'
    ELSE 'BORROWED'
  END AS status,
  false AS discrepancy
FROM public.key_borrowings b
JOIN public.submissions s ON s.id=b.submission_id
LEFT JOIN public.key_returns r ON r.borrowing_id=b.id
GROUP BY
  b.id,s.submission_id,b.borrower_name,b.department,b.key_number,b.key_description,
  b.quantity,b.security_officer_name,b.borrowed_at,b.expected_return_at;

CREATE OR REPLACE VIEW public.outstanding_keys
WITH (security_invoker=true) AS
SELECT
  borrowing_id,
  submission_id,
  borrower_name,
  department,
  key_number,
  key_description,
  borrowed_quantity AS quantity,
  borrowed_quantity,
  returned_quantity,
  outstanding_quantity,
  issued_by_security AS security_officer_name,
  issued_by_security,
  borrowed_at,
  expected_return_at,
  last_returned_at,
  status,
  discrepancy
FROM public.key_control_transactions
WHERE outstanding_quantity > 0;
