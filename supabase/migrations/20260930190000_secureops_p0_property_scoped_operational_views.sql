-- SecureOps P0: make operational views property-aware and RLS-invoker.
create or replace view public.currently_inside as
 select e.id as entry_id, s.submission_id, v.id as visitor_id,
        v.full_name, v.phone, v.company_name, v.category,
        e.work_location, e.purpose, e.pass_vest_number,
        e.security_officer_name, e.entry_at, e.property_id
 from public.visitor_entries e
 join public.submissions s on s.id=e.submission_id
 join public.visitors v on v.id=e.visitor_id
 where e.exit_id is null;

create or replace view public.key_control_transactions as
 select b.id as borrowing_id, s.submission_id, b.borrower_name, b.department,
        b.key_number, b.key_description, b.quantity as borrowed_quantity,
        coalesce(sum(r.quantity),0)::integer as returned_quantity,
        greatest(b.quantity-coalesce(sum(r.quantity),0),0)::integer as outstanding_quantity,
        max(r.returned_at) as last_returned_at,
        b.security_officer_name as issued_by_security,
        b.borrowed_at, b.expected_return_at,
        case
          when greatest(b.quantity-coalesce(sum(r.quantity),0),0)=0 then 'RETURNED'
          when now()>b.expected_return_at then 'OUTSTANDING'
          else 'BORROWED'
        end as status,
        false as discrepancy,
        b.property_id
 from public.key_borrowings b
 join public.submissions s on s.id=b.submission_id
 left join public.key_returns r on r.borrowing_id=b.id
 group by b.id,s.submission_id,b.borrower_name,b.department,b.key_number,
          b.key_description,b.quantity,b.security_officer_name,b.borrowed_at,
          b.expected_return_at,b.property_id;

create or replace view public.key_return_events as
 select r.id as return_id, r.submission_id, s.submission_id as return_public_id,
        r.borrowing_id, r.return_name as returned_by, r.department,
        r.key_number, r.quantity as returned_quantity,
        r.security_officer_name as received_by_security, r.returned_at,
        r.borrowed_quantity as original_borrowed_quantity,
        r.discrepancy_qty, r.property_id
 from public.key_returns r
 left join public.submissions s on s.id=r.submission_id;

create or replace view public.outstanding_keys as
 select borrowing_id, submission_id, borrower_name, department, key_number,
        key_description, borrowed_quantity as quantity, borrowed_quantity,
        returned_quantity, outstanding_quantity, issued_by_security as security_officer_name,
        issued_by_security, borrowed_at, expected_return_at, last_returned_at,
        status, discrepancy, property_id
 from public.key_control_transactions
 where outstanding_quantity>0;

create or replace view public.package_distribution_history as
 select d.id, d.distribution_number, d.package_registration_id, d.package_number,
        d.registered_recipient_name, d.recipient_name, d.security_hand_over,
        d.distributed_at, d.status, d.created_at, p.company_name,
        p.courier_name, p.item_type, p.item_count, p.created_at as registered_at,
        d.note, d.property_id
 from public.package_distributions d
 join public.package_registrations p on p.id=d.package_registration_id;

create or replace view public.recent_activity as
 select s.id, s.submission_id, s.submission_type, s.status, s.submitted_at,
        v.full_name as visitor_name, v.phone, v.company_name, s.property_id
 from public.submissions s
 left join public.visitors v on v.id=s.visitor_id;

alter view public.currently_inside set (security_invoker=true);
alter view public.key_control_transactions set (security_invoker=true);
alter view public.key_return_events set (security_invoker=true);
alter view public.outstanding_keys set (security_invoker=true);
alter view public.package_distribution_history set (security_invoker=true);
alter view public.recent_activity set (security_invoker=true);
