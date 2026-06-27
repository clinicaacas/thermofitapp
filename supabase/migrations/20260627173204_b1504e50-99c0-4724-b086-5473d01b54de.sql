
CREATE OR REPLACE FUNCTION public.read_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'thermofit_cron_secret' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.read_cron_secret() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_cron_secret() TO service_role;
