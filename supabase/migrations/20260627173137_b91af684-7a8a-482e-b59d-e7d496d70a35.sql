
DO $$
DECLARE v_secret text; v_id uuid;
BEGIN
  -- Gera ou reutiliza segredo interno do cron
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'thermofit_cron_secret';
  IF v_id IS NULL THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'thermofit_cron_secret', 'Internal cron auth for materialize-daily-missions');
  END IF;
END $$;

-- Recria agendamento lendo o segredo direto do vault em runtime
DO $$
BEGIN
  PERFORM cron.unschedule('thermofit-materialize-daily-missions')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'thermofit-materialize-daily-missions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'thermofit-materialize-daily-missions',
  '1 3 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://thermofitapp.lovable.app/api/public/hooks/materialize-daily-missions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'thermofit_cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
