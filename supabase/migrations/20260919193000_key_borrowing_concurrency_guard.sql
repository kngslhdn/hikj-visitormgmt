-- Prevent concurrent key borrowing requests from creating
-- multiple outstanding transactions for the same key.
--
-- Key Control V2 uses return events, so the old partial unique
-- index on return_id is no longer applicable.

CREATE OR REPLACE FUNCTION public.prevent_outstanding_key_borrowing_race()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  outstanding_exists boolean;
BEGIN
  -- Serialize borrowing attempts for the same key within a transaction.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.key_number, 0)
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.key_control_transactions
    WHERE key_number = NEW.key_number
      AND outstanding_quantity > 0
  )
  INTO outstanding_exists;

  IF outstanding_exists THEN
    RAISE EXCEPTION
      'Key % is currently outstanding. Please return the outstanding key(s) before a new borrowing.',
      NEW.key_number
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_outstanding_key_borrowing_race() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_outstanding_key_borrowing_race() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_outstanding_key_borrowing_race() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.prevent_outstanding_key_borrowing_race() TO service_role;

DROP TRIGGER IF EXISTS trg_prevent_outstanding_key_borrowing_race
ON public.key_borrowings;

CREATE TRIGGER trg_prevent_outstanding_key_borrowing_race
BEFORE INSERT ON public.key_borrowings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_outstanding_key_borrowing_race();
