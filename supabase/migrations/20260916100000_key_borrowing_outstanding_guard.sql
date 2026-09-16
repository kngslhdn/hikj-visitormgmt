-- Prevent the same key from being borrowed more than once while the previous borrowing is outstanding.
-- The application already checks this in visitor-submit; this database guard closes the race-condition gap.
CREATE UNIQUE INDEX IF NOT EXISTS key_borrowings_one_outstanding_per_key_idx
  ON public.key_borrowings (key_number)
  WHERE return_id IS NULL;
