-- ============================================================
-- HIKJ Visitor Management
-- Supabase / PostgreSQL initial schema
-- ============================================================
-- Architecture:
--   visitors                = reusable visitor identity
--   submissions             = one immutable record per form submission
--   visitor_entries         = Visitor Entry details
--   visitor_exits           = Visitor Exit details
--   key_borrowings          = Key Borrowing details
--   key_returns             = Key Return details
--   package_registrations   = Package Registration details
--   admin_profiles          = future admin roles linked to Supabase Auth
--
-- IMPORTANT:
-- The public website must NOT use the service_role key.
-- Writes should go through a backend / Edge Function using the
-- service_role key, while RLS remains enabled on exposed tables.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type public.submission_type as enum (
    'visitor_entry',
    'visitor_exit',
    'key_borrowing',
    'key_return',
    'package_registration'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.submission_status as enum (
    'submitted',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.admin_role as enum (
    'VIEWER',
    'ADMIN',
    'MANAGER',
    'SUPERADMIN'
  );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- COMMON UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- VISITORS
-- One record per reusable visitor identity.
-- phone_normalized is used for deduplication.
-- ============================================================
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  phone_normalized text,
  company_name text,
  category text check (category in ('Contractor','Supplier','Visitor','Part-time')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists visitors_phone_normalized_unique
  on public.visitors(phone_normalized)
  where phone_normalized is not null and phone_normalized <> '';

create index if not exists visitors_name_idx on public.visitors(lower(full_name));
create index if not exists visitors_company_idx on public.visitors(lower(company_name));

-- ============================================================
-- SUBMISSIONS
-- Central audit/event table.
-- submission_id is the human-readable ID shown to the user.
-- ============================================================
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null unique,
  submission_type public.submission_type not null,
  visitor_id uuid references public.visitors(id) on delete set null,
  status public.submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  whatsapp_opened_at timestamptz,
  whatsapp_sent_at timestamptz,
  source text not null default 'web',
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_type_idx
  on public.submissions(submission_type);
create index if not exists submissions_submitted_at_idx
  on public.submissions(submitted_at desc);
create index if not exists submissions_visitor_idx
  on public.submissions(visitor_id);
create index if not exists submissions_status_idx
  on public.submissions(status);

-- ============================================================
-- VISITOR ENTRY
-- ============================================================
create table if not exists public.visitor_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  visitor_id uuid not null references public.visitors(id) on delete restrict,
  work_location text not null,
  purpose text not null,
  security_officer_name text not null,
  pass_vest_number text not null,
  entry_at timestamptz not null,
  exit_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visitor_entries_entry_at_idx
  on public.visitor_entries(entry_at desc);
create index if not exists visitor_entries_pass_idx
  on public.visitor_entries(pass_vest_number);
create index if not exists visitor_entries_visitor_idx
  on public.visitor_entries(visitor_id);

-- ============================================================
-- VISITOR EXIT
-- entry_id is populated by backend matching logic.
-- ============================================================
create table if not exists public.visitor_exits (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  visitor_id uuid references public.visitors(id) on delete set null,
  entry_id uuid references public.visitor_entries(id) on delete set null,
  visitor_name text not null,
  company_name text,
  pass_vest_number text not null,
  security_officer_name text not null,
  exit_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visitor_exits_exit_at_idx
  on public.visitor_exits(exit_at desc);
create index if not exists visitor_exits_pass_idx
  on public.visitor_exits(pass_vest_number);
create index if not exists visitor_exits_entry_idx
  on public.visitor_exits(entry_id);

-- Add the reverse reference after both tables exist.
alter table public.visitor_entries
  drop constraint if exists visitor_entries_exit_id_fkey;

alter table public.visitor_entries
  add constraint visitor_entries_exit_id_fkey
  foreign key (exit_id) references public.visitor_exits(id) on delete set null;

-- ============================================================
-- KEY BORROWING
-- ============================================================
create table if not exists public.key_borrowings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  borrower_name text not null,
  department text not null,
  key_number text not null,
  key_description text,
  quantity integer not null default 1 check (quantity > 0),
  security_officer_name text not null,
  borrowed_at timestamptz not null,
  return_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists key_borrowings_borrowed_at_idx
  on public.key_borrowings(borrowed_at desc);
create index if not exists key_borrowings_key_number_idx
  on public.key_borrowings(key_number);

-- ============================================================
-- KEY RETURN
-- ============================================================
create table if not exists public.key_returns (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  borrowing_id uuid references public.key_borrowings(id) on delete set null,
  return_name text not null,
  department text not null,
  key_number text not null,
  key_description text,
  quantity integer not null default 1 check (quantity > 0),
  security_officer_name text not null,
  returned_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists key_returns_returned_at_idx
  on public.key_returns(returned_at desc);
create index if not exists key_returns_key_number_idx
  on public.key_returns(key_number);
create index if not exists key_returns_borrowing_idx
  on public.key_returns(borrowing_id);

alter table public.key_borrowings
  drop constraint if exists key_borrowings_return_id_fkey;

alter table public.key_borrowings
  add constraint key_borrowings_return_id_fkey
  foreign key (return_id) references public.key_returns(id) on delete set null;

-- ============================================================
-- PACKAGE REGISTRATION
-- Item photos are stored in Supabase Storage.
-- Only the storage path is stored in PostgreSQL.
-- ============================================================
create table if not exists public.package_registrations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  courier_name text not null,
  phone text,
  phone_normalized text,
  company_name text not null,
  item_type text not null check (item_type in ('LETTER','PACKAGE')),
  item_count integer not null default 1 check (item_count > 0),
  recipient_type text not null check (recipient_type in ('STAFF','GUEST')),
  recipient_name text not null,
  security_officer_name text not null,
  photo_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_registrations_created_at_idx
  on public.package_registrations(created_at desc);
create index if not exists package_registrations_recipient_idx
  on public.package_registrations(lower(recipient_name));

-- ============================================================
-- ADMIN PROFILES
-- Linked to Supabase Auth users for future admin dashboard.
-- ============================================================
create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.admin_role not null default 'VIEWER',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STORAGE BUCKET
-- Private bucket for package photos.
-- The backend/service role handles uploads and signed URLs.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'package-photos',
  'package-photos',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
drop trigger if exists trg_visitors_updated_at on public.visitors;
create trigger trg_visitors_updated_at
before update on public.visitors
for each row execute function public.set_updated_at();

drop trigger if exists trg_submissions_updated_at on public.submissions;
create trigger trg_submissions_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

drop trigger if exists trg_visitor_entries_updated_at on public.visitor_entries;
create trigger trg_visitor_entries_updated_at
before update on public.visitor_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_visitor_exits_updated_at on public.visitor_exits;
create trigger trg_visitor_exits_updated_at
before update on public.visitor_exits
for each row execute function public.set_updated_at();

drop trigger if exists trg_key_borrowings_updated_at on public.key_borrowings;
create trigger trg_key_borrowings_updated_at
before update on public.key_borrowings
for each row execute function public.set_updated_at();

drop trigger if exists trg_key_returns_updated_at on public.key_returns;
create trigger trg_key_returns_updated_at
before update on public.key_returns
for each row execute function public.set_updated_at();

drop trigger if exists trg_package_registrations_updated_at on public.package_registrations;
create trigger trg_package_registrations_updated_at
before update on public.package_registrations
for each row execute function public.set_updated_at();

drop trigger if exists trg_admin_profiles_updated_at on public.admin_profiles;
create trigger trg_admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- SECURITY
-- RLS is enabled now. No anon/authenticated write policies are
-- created intentionally. The future backend/Edge Function will use
-- the service role on the server side.
-- ============================================================
alter table public.visitors enable row level security;
alter table public.submissions enable row level security;
alter table public.visitor_entries enable row level security;
alter table public.visitor_exits enable row level security;
alter table public.key_borrowings enable row level security;
alter table public.key_returns enable row level security;
alter table public.package_registrations enable row level security;
alter table public.admin_profiles enable row level security;

-- Remove default API privileges from public client roles.
revoke all on table public.visitors from anon, authenticated;
revoke all on table public.submissions from anon, authenticated;
revoke all on table public.visitor_entries from anon, authenticated;
revoke all on table public.visitor_exits from anon, authenticated;
revoke all on table public.key_borrowings from anon, authenticated;
revoke all on table public.key_returns from anon, authenticated;
revoke all on table public.package_registrations from anon, authenticated;
revoke all on table public.admin_profiles from anon, authenticated;

-- Storage is private. No public read policy is created.
-- service_role bypasses RLS and is used only by the backend.

-- ============================================================
-- REPORTING VIEWS
-- ============================================================

-- Visitors who have entered and have not yet been matched to an exit.
create or replace view public.currently_inside as
select
  e.id as entry_id,
  s.submission_id,
  v.id as visitor_id,
  v.full_name,
  v.phone,
  v.company_name,
  v.category,
  e.work_location,
  e.purpose,
  e.pass_vest_number,
  e.security_officer_name,
  e.entry_at
from public.visitor_entries e
join public.submissions s on s.id = e.submission_id
join public.visitors v on v.id = e.visitor_id
where e.exit_id is null;

-- Key borrowings which have not yet been matched to a return.
create or replace view public.outstanding_keys as
select
  b.id as borrowing_id,
  s.submission_id,
  b.borrower_name,
  b.department,
  b.key_number,
  b.key_description,
  b.quantity,
  b.security_officer_name,
  b.borrowed_at
from public.key_borrowings b
join public.submissions s on s.id = b.submission_id
where b.return_id is null;

-- One unified recent activity feed for the admin dashboard.
create or replace view public.recent_activity as
select
  s.id,
  s.submission_id,
  s.submission_type,
  s.status,
  s.submitted_at,
  v.full_name as visitor_name,
  v.phone,
  v.company_name
from public.submissions s
left join public.visitors v on v.id = s.visitor_id;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
