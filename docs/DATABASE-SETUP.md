# HIKJ Visitor Management — Supabase Database Setup

## 1. Database choice

HIKJ Visitor Management uses **Supabase Free / PostgreSQL** as the central database.

The application is designed around a central PostgreSQL database rather than separate Google Sheets/Apps Script data stores.

## 2. What is included

The migration creates:

- `visitors` — reusable visitor identity records
- `submissions` — central audit/event record for every submitted form
- `visitor_entries` — Visitor Entry Registration
- `visitor_exits` — Visitor Exit Registration
- `key_borrowings` — Key Borrowing
- `key_returns` — Key Return
- `package_registrations` — Package Registration
- `admin_profiles` — future admin dashboard users and roles
- `currently_inside` — live report of visitors without a matched exit
- `outstanding_keys` — live report of borrowed keys without a matched return
- `recent_activity` — unified activity feed for the admin dashboard
- `package-photos` Storage bucket — private package-photo storage

## 3. Apply the migration

The migration file is:

`supabase/migrations/20260910170000_hikj_visitor_management.sql`

### Supabase Dashboard method

1. Create/open the HIKJ Visitor Management project in Supabase.
2. Open **SQL Editor**.
3. Open or paste the migration file.
4. Run the complete SQL script.
5. Open **Table Editor** and verify the tables.
6. Open **Storage** and verify the private `package-photos` bucket.

Supabase supports creating tables directly through the SQL Editor, and its documentation recommends enabling Row Level Security for exposed tables. citeturn0search3turn0search1

## 4. Security model

RLS is enabled for all application tables.

The public visitor form should **not** connect using a Supabase service-role/secret key. The service-role/secret key bypasses RLS and must remain server-side. citeturn0search11

The intended production flow is:

```text
Visitor Browser
      |
      v
HIKJ Web Form
      |
      v
Backend / Supabase Edge Function
      |
      +----> PostgreSQL
      |
      +----> Supabase Storage (package photo)
      |
      +----> WhatsApp Click-to-Chat link
```

The backend will validate and normalize the input before inserting records.

## 5. Visitor identity logic

A repeat visitor should reuse the existing `visitors.id` whenever the normalized mobile number matches an existing visitor.

Each new visit/event still receives a new `submissions.submission_id`.

This gives the system both:

- one reusable visitor identity; and
- a complete history of individual visits.

## 6. Currently Inside logic

`currently_inside` is based on Visitor Entry records where `exit_id IS NULL`.

The system must not calculate "Currently Inside" simply as total entries minus total exits because an exit must be matched to the correct entry.

The backend will match an exit using the available operational identifiers, primarily the pass/vest number and visitor details.

## 7. Key tracking

`outstanding_keys` contains key borrowings where `return_id IS NULL`.

When a key is returned, the backend should match the return to the corresponding borrowing record and populate the relationship.

## 8. Package photos

Package photos are stored in Supabase Storage, not directly in PostgreSQL. Only `photo_storage_path` is stored in `package_registrations`.

The bucket is private and limited to JPEG, PNG, and WebP images with a 5 MB file limit. Supabase recommends Storage for files rather than storing large binary objects directly in database rows. citeturn0search0turn0search2

## 9. Admin roles

The database is prepared for:

- `VIEWER`
- `ADMIN`
- `MANAGER`
- `SUPERADMIN`

Authentication and role-based dashboard policies will be implemented in the next application phase.

## 10. Current status

The repository now contains the **production database schema/migration**, but the actual Supabase cloud project still needs to be created/selected and the migration executed once.

No database password, service-role key, or other secret is stored in this GitHub repository.
