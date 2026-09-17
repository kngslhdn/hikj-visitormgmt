-- HIKJ Visitor Management - Key Return verification and quantity discrepancy
-- Key Return is verified against the currently outstanding Key Borrowing by Key Number.
-- Key Description is no longer collected/stored on key_returns.

ALTER TABLE public.key_returns
  ADD COLUMN IF NOT EXISTS borrowed_quantity integer;

ALTER TABLE public.key_returns
  ADD COLUMN IF NOT EXISTS discrepancy_qty boolean NOT NULL DEFAULT false;

UPDATE public.key_returns r
SET borrowed_quantity = b.quantity,
    discrepancy_qty = (r.quantity <> b.quantity)
FROM public.key_borrowings b
WHERE r.borrowing_id = b.id
  AND (r.borrowed_quantity IS NULL OR r.discrepancy_qty IS DISTINCT FROM (r.quantity <> b.quantity));

UPDATE public.key_returns
SET borrowed_quantity = quantity
WHERE borrowed_quantity IS NULL;

ALTER TABLE public.key_returns
  ALTER COLUMN borrowed_quantity SET NOT NULL;

ALTER TABLE public.key_returns
  ADD CONSTRAINT key_returns_borrowed_quantity_positive
  CHECK (borrowed_quantity > 0);

ALTER TABLE public.key_returns
  DROP COLUMN IF EXISTS key_description;
