-- ============================================================
-- HIKJ Visitor Management
-- Synchronize public ID sequence after data restore
-- ============================================================
-- The HIKJ public ID sequence is shared by:
--   submissions.submission_id
--   package_distributions.distribution_number
--
-- Run this AFTER restoring application data.
-- It advances the sequence to the highest numeric suffix
-- currently present in either table.
-- ============================================================

DO $$
DECLARE
  max_id bigint;
BEGIN
  SELECT COALESCE(MAX(id_number), 0)
  INTO max_id
  FROM (
    SELECT substring(submission_id from '[A-Z]{2}([0-9]{10})$')::bigint AS id_number
    FROM public.submissions
    WHERE submission_id ~ '^HIKJ-[A-Z]{2}-[A-Z]{2}[0-9]{10}$'

    UNION ALL

    SELECT substring(distribution_number from '[A-Z]{2}([0-9]{10})$')::bigint AS id_number
    FROM public.package_distributions
    WHERE distribution_number ~ '^HIKJ-PD-[A-Z]{2}[0-9]{10}$'
  ) ids;

  IF max_id > 0 THEN
    PERFORM setval(
      'public.hikj_public_id_seq',
      max_id,
      true
    );
  ELSE
    PERFORM setval(
      'public.hikj_public_id_seq',
      1,
      false
    );
  END IF;
END
$$;
