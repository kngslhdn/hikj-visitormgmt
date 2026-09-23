-- Emergency Notification System
-- Source of truth: Supabase production project hmqgmusellcetakoalva
-- Migration: 20260923004735_add_emergency_notification_system

create sequence public.emergency_incidents_incident_number_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table public.emergency_incident_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.emergency_contact_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position text,
  department text,
  phone_number text,
  email text,
  whatsapp_number text,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_contacts_priority_chk check (priority >= 0)
);

create table public.emergency_group_members (
  group_id uuid not null,
  contact_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, contact_id),
  constraint emergency_group_members_group_id_fkey
    foreign key (group_id) references public.emergency_contact_groups(id) on delete cascade,
  constraint emergency_group_members_contact_id_fkey
    foreign key (contact_id) references public.emergency_contacts(id) on delete cascade
);

create table public.emergency_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_number bigint not null default nextval('public.emergency_incidents_incident_number_seq'::regclass) unique,
  incident_id text unique,
  incident_type_id uuid,
  severity text not null default 'URGENT',
  title text not null,
  location text,
  description text,
  status text not null default 'DRAFT',
  test_mode boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint emergency_incidents_incident_type_id_fkey
    foreign key (incident_type_id) references public.emergency_incident_types(id),
  constraint emergency_incidents_created_by_fkey
    foreign key (created_by) references auth.users(id),
  constraint emergency_incident_severity_chk
    check (severity = any (array['URGENT'::text, 'HIGH'::text, 'NORMAL'::text, 'INFORMATION'::text])),
  constraint emergency_incident_status_chk
    check (status = any (array['DRAFT'::text, 'ACTIVE'::text, 'MONITORING'::text, 'RESOLVED'::text, 'CLOSED'::text, 'FALSE_ALARM'::text, 'CANCELLED'::text]))
);

create table public.emergency_incident_recipients (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  contact_id uuid not null,
  group_id uuid,
  selected_at timestamptz not null default now(),
  unique (incident_id, contact_id),
  constraint emergency_incident_recipients_incident_id_fkey
    foreign key (incident_id) references public.emergency_incidents(id) on delete cascade,
  constraint emergency_incident_recipients_contact_id_fkey
    foreign key (contact_id) references public.emergency_contacts(id),
  constraint emergency_incident_recipients_group_id_fkey
    foreign key (group_id) references public.emergency_contact_groups(id)
);

create table public.emergency_message_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  incident_type_code text,
  severity text not null default 'URGENT',
  title_template text not null,
  message_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_template_severity_chk
    check (severity = any (array['URGENT'::text, 'HIGH'::text, 'NORMAL'::text, 'INFORMATION'::text]))
);

create table public.emergency_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  recipient_id uuid not null,
  channel text not null,
  status text not null default 'PENDING',
  provider_message_id text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  constraint emergency_notifications_incident_id_fkey
    foreign key (incident_id) references public.emergency_incidents(id) on delete cascade,
  constraint emergency_notifications_recipient_id_fkey
    foreign key (recipient_id) references public.emergency_incident_recipients(id) on delete cascade,
  constraint emergency_notification_channel_chk
    check (channel = any (array['SMS'::text, 'WHATSAPP'::text, 'EMAIL'::text, 'TELEGRAM'::text, 'PUSH'::text])),
  constraint emergency_notification_status_chk
    check (status = any (array['PENDING'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERED'::text, 'FAILED'::text, 'ACKNOWLEDGED'::text]))
);

create table public.emergency_incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  status text,
  title text,
  message text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint emergency_incident_updates_incident_id_fkey
    foreign key (incident_id) references public.emergency_incidents(id) on delete cascade,
  constraint emergency_incident_updates_created_by_fkey
    foreign key (created_by) references auth.users(id)
);

create table public.emergency_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  contact_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  note text,
  unique (incident_id, contact_id),
  constraint emergency_acknowledgements_incident_id_fkey
    foreign key (incident_id) references public.emergency_incidents(id) on delete cascade,
  constraint emergency_acknowledgements_contact_id_fkey
    foreign key (contact_id) references public.emergency_contacts(id)
);

create or replace function public.set_emergency_incident_id()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.incident_id is null then
    new.incident_id := 'HIKJ-INC-' || to_char(new.created_at,'YYYY') || '-' || lpad(new.incident_number::text,6,'0');
  end if;
  return new;
end;
$function$;

create trigger trg_emergency_incident_id
before insert on public.emergency_incidents
for each row
execute function public.set_emergency_incident_id();

insert into public.emergency_incident_types (id, code, name, active)
values
  ('6eed6de2-9bbb-48c0-a5b6-1bbd543575d1', 'ELEVATOR', 'Elevator Incident', true),
  ('028950ef-c911-4b55-a0fd-090a5f497e75', 'EVACUATION', 'Evacuation', true),
  ('854a1c41-6574-468c-bb90-50f9e6891c17', 'FIRE', 'Fire / Smoke', true),
  ('79aebd34-a0b7-4850-915c-5216128ab9a7', 'GAS', 'Gas Leak', true),
  ('d931b87f-3557-4340-b48e-383d02a2c1e2', 'GUEST', 'Guest Incident', true),
  ('cc7d8e95-aaac-4cec-94d9-602409b7d3cd', 'MEDICAL', 'Medical Emergency', true),
  ('8bebc825-5b9e-4fe4-a7e8-2d5556a90eb0', 'NATURAL_DISASTER', 'Natural Disaster', true),
  ('6a2ee252-b378-44c7-85c0-be01b385db0a', 'OTHER', 'Other', true),
  ('5223b2fa-9065-4489-ad13-9961b782da6f', 'POWER', 'Power Failure', true),
  ('2c4dc98c-e067-4a3c-801e-2d768323dfae', 'SECURITY', 'Security Incident', true),
  ('8148304a-923a-49da-9566-68f1e1c09d11', 'SUSPICIOUS_OBJECT', 'Suspicious Object', true),
  ('0618a2f6-8837-4f73-8979-3132685d49af', 'WATER', 'Water Leak / Flood', true);

insert into public.emergency_contact_groups (id, code, name, description, active)
values
  ('ad235f92-6823-49a7-96d4-5e3da0feccc4', 'ALL_EMERGENCY', 'All Emergency Contacts', 'All active emergency contacts', true),
  ('de730fb8-d99c-4e94-ae48-a0c1276213d3', 'ENGINEERING', 'Engineering', 'Engineering emergency response group', true),
  ('b63add1f-15f3-481e-9613-b953ba5285c8', 'ERT_CORE', 'ERT Core', 'Core Emergency Response Team', true),
  ('94178340-be34-4e1b-aca2-e4b4fce0af68', 'MANAGEMENT', 'Management', 'Hotel management emergency notification group', true),
  ('8d9c8589-cef2-4aa1-a4d5-3b6c9b5dfa35', 'SECURITY', 'Security', 'Security emergency response group', true);

insert into public.emergency_message_templates
  (id, code, name, incident_type_code, severity, title_template, message_template, active)
values
  ('9e6b94d4-be2a-4010-863e-b90f858fdd6e', 'FALSE_ALARM', 'False Alarm / Stand Down', null, 'HIGH',
   'FALSE ALARM – {{title}}',
   'The previously reported incident at {{location}} has been investigated and confirmed as a FALSE ALARM. No further action is required at this time.',
   true),
  ('9ef34582-b5fe-481d-a80f-242f3cb2b2ba', 'FIRE_ALARM', 'Fire Alarm', 'FIRE', 'URGENT',
   'FIRE ALARM ACTIVATION – {{location}}',
   'Fire alarm has been activated at {{location}} at {{time}}. ERT is currently investigating the situation. Please follow hotel emergency procedures and await further instruction.',
   true),
  ('8e451758-01c9-4312-81de-1c3d5782949d', 'MEDICAL', 'Medical Emergency', 'MEDICAL', 'URGENT',
   'MEDICAL EMERGENCY – {{location}}',
   'Medical emergency reported at {{location}} at {{time}}. ERT response is in progress. Please coordinate with the Emergency Response Team.',
   true),
  ('c06b17a7-7fe9-4296-bb7f-ad158de073d1', 'SECURITY', 'Security Incident', 'SECURITY', 'URGENT',
   'SECURITY INCIDENT – {{location}}',
   'Security incident reported at {{location}} at {{time}}. ERT/Security response is in progress. Please follow instructions from the response team.',
   true);
