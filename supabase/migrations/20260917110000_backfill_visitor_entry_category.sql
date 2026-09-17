-- Preserve the category entered at visitor registration for historical records.
UPDATE public.visitor_entries e
SET visitor_category = v.category
FROM public.visitors v
WHERE v.id = e.visitor_id
  AND NULLIF(trim(e.visitor_category), '') IS NULL
  AND v.category IS NOT NULL;
