-- HIKJ Visitor Management - Visitor Identity & History Fix
-- Phone numbers are not unique person identifiers.

DROP INDEX IF EXISTS public.visitors_phone_normalized_unique;
CREATE INDEX IF NOT EXISTS visitors_phone_normalized_idx
  ON public.visitors(phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';

ALTER TABLE public.visitor_entries
  ADD COLUMN IF NOT EXISTS visitor_name text,
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS visitor_company_name text,
  ADD COLUMN IF NOT EXISTS visitor_category text;

UPDATE public.visitor_entries e
SET visitor_name=v.full_name,
    visitor_phone=v.phone,
    visitor_company_name=v.company_name,
    visitor_category=v.category
FROM public.visitors v
WHERE v.id=e.visitor_id
  AND e.visitor_name IS NULL;

-- Repair the two known audit records from the WhatsApp submissions.
INSERT INTO public.visitors(full_name,phone,phone_normalized,company_name,category)
SELECT 'Idam','0812','812','HIKJ','Visitor'
WHERE NOT EXISTS (
  SELECT 1 FROM public.visitors v
  WHERE lower(trim(v.full_name))='idam'
    AND coalesce(v.phone_normalized,'')='812'
    AND coalesce(lower(trim(v.company_name)),'')='hikj'
    AND coalesce(lower(trim(v.category)),'')='visitor'
);

UPDATE public.visitor_entries e
SET visitor_id=v.id,
    visitor_name='Idam',
    visitor_phone='0812',
    visitor_company_name='HIKJ',
    visitor_category='Visitor'
FROM public.submissions s
JOIN public.visitors v
  ON lower(trim(v.full_name))='idam'
 AND coalesce(v.phone_normalized,'')='812'
 AND coalesce(lower(trim(v.company_name)),'')='hikj'
 AND coalesce(lower(trim(v.category)),'')='visitor'
WHERE e.submission_id=s.id
  AND s.submission_id='HIKJ-20260914085341-39969D';

INSERT INTO public.visitors(full_name,phone,phone_normalized,company_name,category)
SELECT 'Idam','08912','8912','HIKJ','Visitor'
WHERE NOT EXISTS (
  SELECT 1 FROM public.visitors v
  WHERE lower(trim(v.full_name))='idam'
    AND coalesce(v.phone_normalized,'')='8912'
    AND coalesce(lower(trim(v.company_name)),'')='hikj'
    AND coalesce(lower(trim(v.category)),'')='visitor'
);

UPDATE public.visitor_entries e
SET visitor_id=v.id,
    visitor_name='Idam',
    visitor_phone='08912',
    visitor_company_name='HIKJ',
    visitor_category='Visitor'
FROM public.submissions s
JOIN public.visitors v
  ON lower(trim(v.full_name))='idam'
 AND coalesce(v.phone_normalized,'')='8912'
 AND coalesce(lower(trim(v.company_name)),'')='hikj'
 AND coalesce(lower(trim(v.category)),'')='visitor'
WHERE e.submission_id=s.id
  AND s.submission_id='HIKJ-20260914085502-F1A27C';

CREATE OR REPLACE VIEW public.currently_inside AS
SELECT e.id AS entry_id,s.submission_id,v.id AS visitor_id,
       coalesce(e.visitor_name,v.full_name) AS full_name,
       coalesce(e.visitor_phone,v.phone) AS phone,
       coalesce(e.visitor_company_name,v.company_name) AS company_name,
       coalesce(e.visitor_category,v.category) AS category,
       e.work_location,e.purpose,e.pass_vest_number,e.security_officer_name,e.entry_at
FROM public.visitor_entries e
JOIN public.submissions s ON s.id=e.submission_id
JOIN public.visitors v ON v.id=e.visitor_id
WHERE e.exit_id IS NULL;

CREATE OR REPLACE VIEW public.recent_activity AS
SELECT s.id,s.submission_id,s.submission_type,s.status,s.submitted_at,
       coalesce(e.visitor_name,x.visitor_name,v.full_name) AS visitor_name,
       coalesce(e.visitor_phone,v.phone) AS phone,
       coalesce(e.visitor_company_name,x.company_name,v.company_name) AS company_name
FROM public.submissions s
LEFT JOIN public.visitors v ON v.id=s.visitor_id
LEFT JOIN public.visitor_entries e ON e.submission_id=s.id
LEFT JOIN public.visitor_exits x ON x.submission_id=s.id;
