
ALTER TABLE public.clients
  ALTER CONSTRAINT clients_active_journey_id_fkey DEFERRABLE INITIALLY IMMEDIATE;

DO $$
DECLARE
  v_tenant uuid := '5ee57d71-abbd-4bd0-8e32-1b8697f44c34';
  v_user_id uuid := 'e2e00001-0000-0000-0000-000000000001';
  v_client_id uuid := 'e2e00001-0000-0000-0000-0000000000c1';
  v_journey_id uuid := 'e2e00001-0000-0000-0000-0000000000a1';
  v_video1 uuid := 'e2e00001-0000-0000-0000-00000000d001';
  v_video2 uuid := 'e2e00001-0000-0000-0000-00000000d002';
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_email text := 'e2e-missoes@thermofit.test';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt('TesteE2E2026!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"E2E MISSOES - NAO USAR EM PRODUCAO"}'::jsonb,
    false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  SET CONSTRAINTS clients_active_journey_id_fkey DEFERRED;

  INSERT INTO public.clients (
    id, tenant_id, name, email, phone, start_date, plan, goal, complaint,
    clinical_notes, hydration_goal_ml, status, avatar_initial,
    auth_user_id, access_email, access_status, active_journey_id
  ) VALUES (
    v_client_id, v_tenant,
    'E2E MISSÕES — NÃO USAR EM PRODUÇÃO',
    v_email, '+55 11 90000-0000', v_today,
    'teste', 'Teste E2E', 'Conta automatizada de QA',
    'Conta sintética. Limpar após teste.', 2000, 'ativo', 'E',
    v_user_id, v_email, 'ativo', v_journey_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.client_journeys (
    id, tenant_id, client_id, journey_number, status, started_on, notes
  ) VALUES (
    v_journey_id, v_tenant, v_client_id, 1, 'active', v_today,
    'E2E MISSÕES — jornada sintética. Limpar após teste.'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.videos (
    id, tenant_id, title, description, url, thumbnail_url,
    duration_seconds, category, status, video_type, release_day,
    miles_on_complete, min_completion_pct, storage_key, file_name
  ) VALUES
    (v_video1, v_tenant, '[E2E] Vídeo Teste 1', 'Vídeo sintético de QA — NÃO USAR.',
     'https://rfancwbqtnkzahckgfwh.supabase.co/storage/v1/object/public/videos/e2e/video1.mp4',
     '', 8, 'teste', 'ativo', 'daily', 0, 5, 90, 'e2e/video1.mp4', 'video1.mp4'),
    (v_video2, v_tenant, '[E2E] Vídeo Teste 2', 'Vídeo sintético de QA — NÃO USAR.',
     'https://rfancwbqtnkzahckgfwh.supabase.co/storage/v1/object/public/videos/e2e/video2.mp4',
     '', 8, 'teste', 'ativo', 'daily', 0, 5, 90, 'e2e/video2.mp4', 'video2.mp4')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.generate_journey_missions(v_client_id, v_journey_id);
  PERFORM public.materialize_daily_missions_all(v_today);
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='thermofit-materialize-daily-missions') THEN
    PERFORM cron.unschedule('thermofit-materialize-daily-missions');
  END IF;
  PERFORM cron.schedule(
    'thermofit-materialize-daily-missions',
    '1 3 * * *',
    $cron$ SELECT public.materialize_daily_missions_all(NULL); $cron$
  );
END $$;
