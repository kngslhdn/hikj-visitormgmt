-- Prevent duplicate emergency contact identities.
-- Email is case-insensitive; WhatsApp numbers are normalized to digits only.
create unique index if not exists emergency_contacts_email_unique_idx
  on public.emergency_contacts (lower(trim(email)))
  where nullif(trim(email), '') is not null;

create unique index if not exists emergency_contacts_whatsapp_unique_idx
  on public.emergency_contacts (regexp_replace(whatsapp_number, '[^0-9]+', '', 'g'))
  where nullif(regexp_replace(coalesce(whatsapp_number, ''), '[^0-9]+', '', 'g'), '') is not null;
