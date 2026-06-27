-- Entrega 1 — Correção da fonte oficial de Milhas + reconciliação

-- 1) Remover overload defeituoso de award_miles (7 args, sem journey_id).
DROP FUNCTION IF EXISTS public.award_miles(
  uuid, text, text, integer, text, text, jsonb
);

-- 2) Garantir o overload canônico (8 args).
CREATE OR REPLACE FUNCTION public.award_miles(
  _client_id uuid, _source_kind text, _source_ref text, _miles integer,
  _idempotency_key text, _reason text DEFAULT ''::text,
  _metadata jsonb DEFAULT '{}'::jsonb, _journey_id uuid DEFAULT NULL::uuid
)
RETURNS public.miles_ledger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_tenant uuid; v_journey uuid; v_row public.miles_ledger;
BEGIN
  IF _miles IS NULL OR _miles = 0 THEN RAISE EXCEPTION 'award_miles: miles must be non-zero'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 4 THEN RAISE EXCEPTION 'award_miles: idempotency_key required'; END IF;
  SELECT tenant_id, active_journey_id INTO v_tenant, v_journey FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'award_miles: client not found'; END IF;
  v_journey := COALESCE(_journey_id, v_journey);
  IF v_journey IS NULL THEN RAISE EXCEPTION 'award_miles: journey not resolved for client %', _client_id; END IF;

  INSERT INTO public.miles_ledger
    (tenant_id, client_id, journey_id, source_kind, source_ref, miles,
     reason, idempotency_key, awarded_by, metadata)
  VALUES
    (v_tenant, _client_id, v_journey, _source_kind, _source_ref, _miles,
     COALESCE(_reason,''), _idempotency_key, auth.uid(), COALESCE(_metadata,'{}'::jsonb))
  ON CONFLICT (client_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.miles_ledger
      WHERE client_id = _client_id AND idempotency_key = _idempotency_key;
  END IF;
  RETURN v_row;
END;
$fn$;

-- 3) Consolidar mission_settings: desativar aliases não-oficiais.
UPDATE public.mission_settings
SET active = false, updated_at = now()
WHERE mission_kind IN (
  'meal_confirm','video_watch_90','video_task','weekly_evolution_photo',
  'workout_full','workout_cardio','workout_rest','workout_photo_bonus'
);
UPDATE public.mission_settings SET default_miles = 5,  label = 'Check-in diário',           active = true WHERE mission_kind = 'daily_checkin';
UPDATE public.mission_settings SET default_miles = 5,  label = 'Alimentação do dia',        active = true WHERE mission_kind = 'daily_meal';
UPDATE public.mission_settings SET default_miles = 10, label = 'Treino do dia',             active = true WHERE mission_kind = 'daily_workout';
UPDATE public.mission_settings SET default_miles = 5,  label = 'Foto do treino',            active = true WHERE mission_kind = 'workout_photo';
UPDATE public.mission_settings SET default_miles = 10, label = 'Meta de hidratação (2L)',   active = true WHERE mission_kind = 'hydration_goal';
UPDATE public.mission_settings SET default_miles = 5,  label = 'Vídeo do dia concluído',    active = true WHERE mission_kind = 'video_complete';
UPDATE public.mission_settings SET default_miles = 15, label = 'Foto de evolução semanal',  active = true WHERE mission_kind = 'weekly_photo';
UPDATE public.mission_settings SET default_miles = 10, label = 'Tarefa pós-vídeo',          active = true WHERE mission_kind = 'post_video_task';

-- 4) Reconciliar Celestina.
DO $rec$
DECLARE
  v_client uuid := 'aa080ec6-8e7c-4e60-b7ae-0d8370e181a3';
  v_journey uuid := '361fabd0-f8a5-433a-9d07-53cfe6391848';
  v_tenant uuid;
  r record;
  v_row public.miles_ledger;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = v_client;

  -- 4a) Vídeos completos sem crédito
  FOR r IN
    SELECT video_id, completed_at::date AS day
      FROM public.client_video_progress
     WHERE client_id = v_client AND is_completed = true
  LOOP
    v_row := public.award_miles(
      v_client, 'video_complete', r.video_id::text, 5,
      'video_complete:' || r.video_id::text,
      'Reconciliação técnica Entrega 1 — vídeo concluído',
      jsonb_build_object('reconciled', true, 'day', r.day),
      v_journey
    );
    IF v_row.id IS NOT NULL AND v_row.reason ILIKE 'Reconcilia%' THEN
      INSERT INTO public.miles_audit_log
        (tenant_id, client_id, action, justification, payload)
      VALUES
        (v_tenant, v_client, 'reconciliation_credit',
         'Reconciliação Entrega 1: crédito de vídeo concluído ausente no ledger',
         jsonb_build_object('source_kind','video_complete','source_ref', r.video_id::text,'miles',5,'day',r.day));
    END IF;
  END LOOP;

  -- 4b) Dias com 2L+ de hidratação sem crédito
  FOR r IN
    SELECT log_date, SUM(ml) AS total
      FROM public.client_hydration_logs
     WHERE client_id = v_client
     GROUP BY log_date
    HAVING SUM(ml) >= 2000
  LOOP
    v_row := public.award_miles(
      v_client, 'hydration_goal', r.log_date::text, 10,
      'hydration_goal:' || r.log_date::text,
      'Reconciliação técnica Entrega 1 — meta de hidratação 2L',
      jsonb_build_object('reconciled', true, 'ml', r.total),
      v_journey
    );
    IF v_row.id IS NOT NULL AND v_row.reason ILIKE 'Reconcilia%' THEN
      INSERT INTO public.miles_audit_log
        (tenant_id, client_id, action, justification, payload)
      VALUES
        (v_tenant, v_client, 'reconciliation_credit',
         'Reconciliação Entrega 1: meta de hidratação atingida sem crédito',
         jsonb_build_object('source_kind','hydration_goal','source_ref', r.log_date::text,'miles',10,'ml',r.total));
    END IF;
  END LOOP;
END
$rec$;

-- 5) Realtime
DO $rt$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.miles_ledger;               EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_mission_completions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_video_progress;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_hydration_logs;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_task_responses;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_daily_responses;     EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_progress_photos;     EXCEPTION WHEN duplicate_object THEN NULL; END;
END $rt$;