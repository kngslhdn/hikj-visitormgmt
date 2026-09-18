-- Key Control V2 schema sync
alter table public.key_borrowings add column if not exists expected_return_at timestamptz;
alter table public.key_returns add column if not exists returned_by text;
update public.key_returns set returned_by=return_name where returned_by is null;
drop view if exists public.outstanding_keys;
alter table public.key_borrowings drop constraint if exists key_borrowings_return_id_fkey;
drop index if exists key_borrowings_one_outstanding_per_key_idx;
alter table public.key_borrowings drop column if exists return_id;
alter table public.key_returns drop constraint if exists key_returns_borrowed_quantity_positive;
create or replace view public.key_control_transactions with (security_invoker=true) as
select b.id borrowing_id,s.submission_id,b.borrower_name,b.department,b.key_number,b.key_description,
b.quantity borrowed_quantity,coalesce(sum(r.quantity),0)::integer returned_quantity,
greatest(b.quantity-coalesce(sum(r.quantity),0),0)::integer outstanding_quantity,
max(r.returned_at) last_returned_at,b.security_officer_name issued_by_security,b.borrowed_at,
b.expected_return_at,
case when coalesce(sum(r.quantity),0)=0 and b.expected_return_at is not null and now()>b.expected_return_at then 'OVERDUE'
when greatest(b.quantity-coalesce(sum(r.quantity),0),0)=0 then 'CLOSED'
when coalesce(sum(r.quantity),0)>0 then 'PARTIALLY RETURNED' else 'ACTIVE' end status,
(coalesce(sum(r.quantity),0)<>0 and coalesce(sum(r.quantity),0)<>b.quantity) discrepancy
from public.key_borrowings b join public.submissions s on s.id=b.submission_id
left join public.key_returns r on r.borrowing_id=b.id
group by b.id,s.submission_id,b.borrower_name,b.department,b.key_number,b.key_description,b.quantity,
b.security_officer_name,b.borrowed_at,b.expected_return_at;
create or replace view public.outstanding_keys with (security_invoker=true) as
select borrowing_id,submission_id,borrower_name,department,key_number,key_description,borrowed_quantity quantity,
borrowed_quantity,returned_quantity,outstanding_quantity,issued_by_security security_officer_name,
issued_by_security,borrowed_at,expected_return_at,last_returned_at,status,discrepancy
from public.key_control_transactions where outstanding_quantity>0;
create or replace function public.validate_key_return_quantity() returns trigger language plpgsql set search_path=public as $
declare borrowed_qty integer; returned_qty integer;
begin
 if new.borrowing_id is null then raise exception 'Borrowing transaction is required'; end if;
 select quantity into borrowed_qty from public.key_borrowings where id=new.borrowing_id for update;
 if borrowed_qty is null then raise exception 'Borrowing transaction not found'; end if;
 select coalesce(sum(quantity),0) into returned_qty from public.key_returns where borrowing_id=new.borrowing_id and id<>new.id;
 if returned_qty+new.quantity>borrowed_qty then raise exception 'Return quantity exceeds outstanding quantity'; end if;
 return new;
end $$;
drop trigger if exists trg_validate_key_return_quantity on public.key_returns;
create trigger trg_validate_key_return_quantity before insert or update on public.key_returns for each row execute function public.validate_key_return_quantity();
create or replace view public.key_return_events with (security_invoker=true) as
select r.id return_id,r.submission_id,r.borrowing_id,r.return_name returned_by,r.department,r.key_number,
r.quantity returned_quantity,r.security_officer_name received_by_security,r.returned_at,
r.borrowed_quantity original_borrowed_quantity,r.discrepancy_qty from public.key_returns r;