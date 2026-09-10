# HIKJ Visitor Management — Admin Dashboard Setup

## Dashboard URL

After GitHub Pages is enabled, the dashboard is available at:

`/admin/`

Example:

`https://<github-pages-domain>/admin/`

## 1. Configure Supabase

Open `admin/index.html` and replace:

- `YOUR_SUPABASE_PROJECT_URL`
- `YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY`

Use only the public **anon/publishable key** in the browser. Never put a Supabase `service_role` or secret key into this file.

## 2. Run migrations

Run these SQL migrations in Supabase SQL Editor, in this order:

1. `supabase/migrations/20260910170000_hikj_visitor_management.sql`
2. `supabase/migrations/20260910173000_admin_dashboard_rls.sql`

The second migration creates the secure admin-read policy and `is_active_admin()` authorization function.

## 3. Create the first admin login

In Supabase Authentication, create the user account with the required email/password.

Then run this SQL in SQL Editor, replacing the email and name:

```sql
insert into public.admin_profiles (user_id, full_name, role, active)
select id, 'HIKJ Security Admin', 'SUPERADMIN', true
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active;
```

The dashboard checks both Supabase Authentication and `admin_profiles.active` before allowing access.

## 4. Dashboard features

- Secure email/password sign-in
- Role display
- Total visitors
- Today's visitor entries
- Today's visitor exits
- Currently Inside
- Outstanding key count
- Today's package count
- Recent activity
- Live Currently Inside list
- Visitor search by name, phone, company, or pass
- Visitor date-range filter
- Key monitoring
- Package monitoring
- CSV export for activity, currently inside, keys, and packages
- Manual refresh

## 5. Monitoring logic

`Currently Inside` uses the database `currently_inside` view, which is based on entries without a matched exit. It is not calculated as a simple entry-minus-exit count.

Outstanding keys use the `outstanding_keys` view and show borrowings without a matched return.

## 6. Important current limitation

The dashboard reads the centralized Supabase database. The public `index.html` form still contains the legacy Google Apps Script endpoints. Until the backend migration phase is completed, new visitor form submissions will not automatically populate the new Supabase tables.

The next implementation phase should replace those legacy submission calls with a secure Supabase Edge Function/backend that validates input, reuses visitor identities, creates `submissions`, matches exits/returns, and uploads package photos to private Storage.
