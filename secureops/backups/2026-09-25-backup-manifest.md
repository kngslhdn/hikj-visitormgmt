# SecureOps Backup Manifest — 2026-09-25

## GitHub
- Repository: kngslhdn/hikj-visitormgmt
- Default branch: main
- Backup branch: secureops-backup-2026-09-25
- Backup commit: 882ee9246fb42acfb9e229611e03dae8753a1317
- Repository visibility: public

## Supabase
- Project ref: hmqgmusellcetakoalva
- Project status: ACTIVE_HEALTHY
- Region: ap-northeast-1
- PostgreSQL: 17.6.1.166
- Organization plan: Free

## Edge Functions — production snapshot
- admin-api: v259, verify_jwt=false, sha256=4bf2a586d00b3dc16400262b13508eebbebcb25f012e66b13b217aa111d0877e
- visitor-submit: v283, verify_jwt=false, sha256=9fed2dcf51939c791a5b567942315c84c38196422bbb5cf7a683efc2e13860a1
- package-distribution: v269, verify_jwt=false, sha256=9a7284e6831efa1ece54166ad480f1ea641cd9fa5ab8ca7c921aef079b47128c
- admin-console-api: v270, verify_jwt=false, sha256=8b01ec8e645651d288a89cee3341a38894ab554e7c1e0be7e8b33f58be0fe332
- visitor-monitoring: v270, verify_jwt=false, sha256=65303a4f2f274550789d85cff9056eff272c3821bda964461ad9b6b45c847341
- visitor-detail: v254, verify_jwt=false, sha256=864a40736ef12ba9b89cdf198548dc79f93ad19b43286a1036c6edd761c149f9
- emergency-api: v102, verify_jwt=true, sha256=4c3faad25f0c083442f2ca16e3afc7018fa70abae554d96113dac754993303b4

## Database migration snapshot
- 20260921081906 remote_schema
- 20260921083842 remove_unused_fk_indexes_20260921
- 20260921083939 restore_fk_covering_indexes_20260921_final
- 20260923004735 add_emergency_notification_system
- 20260923004850 harden_emergency_rls_and_fk_indexes
- 20260923132827 add_emergency_channel_targets
- 20260923144550 20260923143000_add_emergency_management_settings
- 20260923144814 20260923145000_add_emergency_settings_updated_by_index
- 20260923144839 20260923145500_customize_emergency_incident_id_prefix
- 20260923152700 add_emergency_smtp_vault_credentials
- 20260923153758 prevent_duplicate_emergency_contacts
- 20260923181008 remove_unused_indexes_20260924
- 20260923181034 restore_fk_indexes_after_unused_cleanup

## Backup status
- GitHub source snapshot: VERIFIED via dedicated backup branch.
- Supabase production metadata snapshot: VERIFIED.
- Edge Function production versions/hashes: VERIFIED.
- Supabase database logical export: PENDING.
- Supabase Storage objects: PENDING.

## Important
This manifest is a verification record, not a replacement for a database dump. The Supabase project is on the Free plan, so an off-site logical database export should be created with the Supabase CLI/pg_dump before production security changes.
