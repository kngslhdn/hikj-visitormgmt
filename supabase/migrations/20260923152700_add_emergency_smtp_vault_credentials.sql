-- HIKJ Emergency SMTP credentials are stored in Supabase Vault, not emergency_settings.
-- The helper functions are callable only by the Edge Function service role.

create or replace function public.emergency_set_smtp_secret(
  p_name text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name not in ('hikj_emergency_smtp_username','hikj_emergency_smtp_password') then
    raise exception 'Unsupported SMTP secret name.';
  end if;
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'SMTP secret value cannot be empty.';
  end if;

  select id into v_id
    from vault.secrets
   where name = p_name
   limit 1;

  if v_id is null then
    perform vault.create_secret(
      p_secret,
      p_name,
      'HIKJ Emergency Response SMTP credential'
    );
  else
    perform vault.update_secret(
      v_id,
      p_secret,
      p_name,
      'HIKJ Emergency Response SMTP credential'
    );
  end if;
end;
$$;

create or replace function public.emergency_get_smtp_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in ('hikj_emergency_smtp_username','hikj_emergency_smtp_password') then
    raise exception 'Unsupported SMTP secret name.';
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = p_name
   limit 1;

  return v_secret;
end;
$$;

revoke execute on function public.emergency_set_smtp_secret(text,text) from public, anon, authenticated;
revoke execute on function public.emergency_get_smtp_secret(text) from public, anon, authenticated;
grant execute on function public.emergency_set_smtp_secret(text,text) to service_role;
grant execute on function public.emergency_get_smtp_secret(text) to service_role;
