
DO $$
DECLARE v_cron text := current_setting('app.cron_secret', true);
BEGIN
  -- Remove agendamento anterior, se existir
  PERFORM cron.unschedule('thermofit-materialize-daily-missions')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'thermofit-materialize-daily-missions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recria agendamento usando header x-cron-secret. O valor do segredo precisa
-- ser configurado via psql/admin uma vez (não exponha no código). Use:
--   ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET>';  -- não rodar aqui
-- O comando abaixo lê do GUC em tempo de execução.
SELECT cron.schedule(
  'thermofit-materialize-daily-missions',
  '1 3 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://thermofitapp.lovable.app/api/public/hooks/materialize-daily-missions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(current_setting('app.cron_secret', true), '')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
