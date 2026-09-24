# HIKJ Visitor Management — SecureOps Backup Verification Manifest

Date: 2026-09-24
Supabase project: hmqgmusellcetakoalva
Region: ap-northeast-1
Postgres: 17.6.1.166
Project status: ACTIVE_HEALTHY

## Backup / rollback evidence
- Git source-of-truth: kngslhdn/hikj-visitormgmt
- Latest verified Git commit before this manifest: 2fc7c8711a14a7a6dd2707913eb1a24804247e9d
- Supabase migration history is present through 20260923181034 restore_fk_indexes_after_unused_cleanup.
- Public schema inventory: 23 tables; all 23 have RLS enabled.
- This is a verification manifest, NOT a portable database data dump.
- The connected Supabase tooling does not expose pg_dump/downloadable database backups, so a downloadable DB dump was not created here.

## Public table row-count snapshot
visitors=15
submissions=52
visitor_entries=13
visitor_exits=11
key_borrowings=9
key_returns=3
package_registrations=6
admin_profiles=3
package_distributions=6
app_settings=2
key_assets=509
audit_logs=38
emergency_incident_types=13
emergency_contact_groups=6
emergency_contacts=2
emergency_group_members=0
emergency_message_templates=4
emergency_incidents=11
emergency_incident_recipients=3
emergency_notifications=19
emergency_incident_updates=18
emergency_acknowledgements=0
emergency_settings=12

## Edge Functions verified
admin-api v257
visitor-submit v280
package-distribution v267
admin-console-api v267
visitor-monitoring v268
visitor-detail v252
emergency-api v100

## Security diagnostic
- Public tables: 23
- RLS enabled: 23/23
- Public RLS policies: 23
- Public triggers: 16
- Duplicate public trigger names: none found
- Security Advisor: 1 WARN — leaked password protection disabled
- Performance Advisor: 12 INFO unused-index notices
- emergency_get_smtp_secret: SECURITY DEFINER, empty search_path, service_role-only EXECUTE
- emergency_set_smtp_secret: SECURITY DEFINER, empty search_path, service_role-only EXECUTE
- is_active_admin(): not present in current public function inventory.

## Next actions
P0: no new Security Advisor P0 was reported; continue manual authorization/RLS verification before changes.
P1: enable leaked-password protection if supported by the project plan; review unused indexes against workload before removing any.
