-- P2: enforce the same logo upload restrictions at the Storage bucket level.
-- Application validation remains in admin-console-api; this is defense in depth.
UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]::text[]
WHERE id = 'property-assets';
