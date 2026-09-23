alter table public.emergency_notifications
  alter column recipient_id drop not null;

alter table public.emergency_notifications
  add column if not exists group_id uuid references public.emergency_contact_groups(id) on delete cascade;

create index if not exists idx_emergency_notifications_group
  on public.emergency_notifications(group_id);

alter table public.emergency_contact_groups
  add column if not exists whatsapp_group_url text;

create index if not exists idx_emergency_group_members_group_contact
  on public.emergency_group_members(group_id, contact_id);
