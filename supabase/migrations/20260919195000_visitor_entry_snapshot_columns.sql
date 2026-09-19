-- ============================================================
-- HIKJ Visitor Management
-- Visitor Entry Snapshot Columns
-- ============================================================
-- Preserve visitor identity data at the time of entry.
-- These columns are intentionally stored on visitor_entries
-- so historical records remain readable even if the reusable
-- visitor master record changes later.
-- ============================================================

ALTER TABLE public.visitor_entries
  ADD COLUMN IF NOT EXISTS visitor_name_snapshot text,
  ADD COLUMN IF NOT EXISTS phone_snapshot text,
  ADD COLUMN IF NOT EXISTS company_name_snapshot text,
  ADD COLUMN IF NOT EXISTS category_snapshot text;
