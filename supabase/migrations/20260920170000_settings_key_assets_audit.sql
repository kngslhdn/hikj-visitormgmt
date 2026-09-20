-- HIKJ Visitor Management - Settings, Key Assets and Audit Log
create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  description text,
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.key_assets (
  id uuid primary key default gen_random_uuid(),
  key_number text not null unique,
  key_description text,
  location_department text,
  quantity integer not null default 1 check (quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  module text not null,
  target text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists key_assets_active_idx on public.key_assets(active);

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_key_assets_updated_at on public.key_assets;
create trigger trg_key_assets_updated_at before update on public.key_assets
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
alter table public.key_assets enable row level security;
alter table public.audit_logs enable row level security;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.key_assets from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

insert into public.app_settings(setting_key,setting_value,description)
values
('whatsapp',jsonb_build_object('recipient_name','HIKJ Security','phone_number','6281314414955'),'WhatsApp recipient used by public forms'),
('operations',jsonb_build_object(
 'hotel_name','Hotel Indonesia Kempinski Jakarta',
 'security_department','HIKJ Security Operations',
 'timezone','Asia/Jakarta',
 'visitor_entry_enabled',true,
 'visitor_exit_enabled',true,
 'key_borrowing_enabled',true,
 'key_return_enabled',true,
 'package_registration_enabled',true,
 'package_distribution_enabled',true
),'Operational system configuration')
on conflict (setting_key) do nothing;
