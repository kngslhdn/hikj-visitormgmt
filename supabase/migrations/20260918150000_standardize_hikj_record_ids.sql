-- Standardize all user-visible operational IDs
-- Format: HIKJ-<FORM>-<2 letters><10 digits>
-- Form codes: VE visitor entry, VX visitor exit, KB key borrowing,
-- KR key return, PR package registration, PD package distribution

create sequence if not exists public.hikj_public_id_seq as bigint start 1;

create or replace function public.generate_hikj_record_id(p_form_code text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n bigint;
  code text := upper(trim(coalesce(p_form_code,'')));
  letters text;
begin
  if code !~ '^[A-Z]{2}$' then
    raise exception 'Invalid HIKJ form code: %', p_form_code;
  end if;
  n := nextval('public.hikj_public_id_seq');
  if n > 9999999999 then
    raise exception 'HIKJ public ID sequence exhausted';
  end if;
  letters :=
    chr(65 + (((n - 1) / 26) % 26)::integer) ||
    chr(65 + ((n - 1) % 26)::integer);
  return 'HIKJ-' || code || '-' || letters || lpad(n::text,10,'0');
end;
$$;

revoke execute on function public.generate_hikj_record_id(text) from public, anon, authenticated;
grant execute on function public.generate_hikj_record_id(text) to service_role;

create or replace function public.set_submission_public_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  code text;
begin
  if new.submission_id is null or new.submission_id !~ '^HIKJ-[A-Z]{2}-[A-Z]{2}[0-9]{10}$' then
    code := case new.submission_type::text
      when 'visitor_entry' then 'VE'
      when 'visitor_exit' then 'VX'
      when 'key_borrowing' then 'KB'
      when 'key_return' then 'KR'
      when 'package_registration' then 'PR'
      else 'OT'
    end;
    new.submission_id := public.generate_hikj_record_id(code);
  end if;
  return new;
end;
$$;

revoke execute on function public.set_submission_public_id() from public, anon, authenticated;

drop trigger if exists trg_submissions_public_id on public.submissions;
create trigger trg_submissions_public_id
before insert on public.submissions
for each row execute function public.set_submission_public_id();

alter table public.package_distributions
  add column if not exists distribution_number text;

create or replace function public.set_package_distribution_public_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.distribution_number is null or new.distribution_number !~ '^HIKJ-PD-[A-Z]{2}[0-9]{10}$' then
    new.distribution_number := public.generate_hikj_record_id('PD');
  end if;
  return new;
end;
$$;

revoke execute on function public.set_package_distribution_public_id() from public, anon, authenticated;

drop trigger if exists trg_package_distributions_public_id on public.package_distributions;
create trigger trg_package_distributions_public_id
before insert on public.package_distributions
for each row execute function public.set_package_distribution_public_id();

update public.submissions
set submission_id = public.generate_hikj_record_id(
  case submission_type::text
    when 'visitor_entry' then 'VE'
    when 'visitor_exit' then 'VX'
    when 'key_borrowing' then 'KB'
    when 'key_return' then 'KR'
    when 'package_registration' then 'PR'
    else 'OT'
  end
)
where submission_id !~ '^HIKJ-[A-Z]{2}-[A-Z]{2}[0-9]{10}$';

update public.package_distributions d
set package_number = psub.submission_id
from public.package_registrations p
join public.submissions psub on psub.id = p.submission_id
where p.id = d.package_registration_id;

update public.package_distributions
set distribution_number = public.generate_hikj_record_id('PD')
where distribution_number is null
   or distribution_number !~ '^HIKJ-PD-[A-Z]{2}[0-9]{10}$';

alter table public.package_distributions
  alter column distribution_number set not null;

alter table public.submissions
  drop constraint if exists submissions_submission_id_format_check;

alter table public.submissions
  add constraint submissions_submission_id_format_check
  check (submission_id ~ '^HIKJ-[A-Z]{2}-[A-Z]{2}[0-9]{10}$');

alter table public.package_distributions
  drop constraint if exists package_distributions_distribution_number_format_check;

alter table public.package_distributions
  add constraint package_distributions_distribution_number_format_check
  check (distribution_number ~ '^HIKJ-PD-[A-Z]{2}[0-9]{10}$');

create unique index if not exists package_distributions_distribution_number_key
  on public.package_distributions(distribution_number);

drop view if exists public.package_distribution_history;
create or replace view public.package_distribution_history
with (security_invoker=true)
as
select
  d.id,
  d.distribution_number,
  d.package_registration_id,
  d.package_number,
  d.registered_recipient_name,
  d.recipient_name,
  d.security_hand_over,
  d.distributed_at,
  d.status,
  d.created_at,
  p.company_name,
  p.courier_name,
  p.item_type,
  p.item_count,
  p.created_at as registered_at
from public.package_distributions d
join public.package_registrations p on p.id=d.package_registration_id;

drop view if exists public.key_return_events;
create or replace view public.key_return_events
with (security_invoker=true)
as
select
  r.id as return_id,
  r.submission_id,
  s.submission_id as return_public_id,
  r.borrowing_id,
  r.return_name as returned_by,
  r.department,
  r.key_number,
  r.quantity as returned_quantity,
  r.security_officer_name as received_by_security,
  r.returned_at,
  r.borrowed_quantity as original_borrowed_quantity,
  r.discrepancy_qty
from public.key_returns r
left join public.submissions s on s.id=r.submission_id;
