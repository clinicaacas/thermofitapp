-- Turno B: Geração idempotente da jornada de 12 semanas + Selos (7/14/21) + Marcos (300/600/900/1300)

-- 1) Garantir mission_settings padrão por tenant (apenas insere se faltar; NÃO sobrescreve)
CREATE OR REPLACE FUNCTION public.ensure_mission_settings(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.mission_settings (tenant_id, mission_kind, label, default_miles, active, metadata)
  VALUES
    (_tenant_id, 'daily_checkin',   'Check-in diário',         10, true, '{}'::jsonb),
    (_tenant_id, 'daily_meal',      'Alimentação do dia',      10, true, '{}'::jsonb),
    (_tenant_id, 'daily_workout',   'Treino do dia',           15, true, '{}'::jsonb),
    (_tenant_id, 'workout_photo',   'Foto do treino',          10, true, '{}'::jsonb),
    (_tenant_id, 'hydration_goal',  'Meta de hidratação',      10, true, '{}'::jsonb),
    (_tenant_id, 'video_complete',  'Vídeo do dia concluído',  20, true, '{}'::jsonb),
    (_tenant_id, 'weekly_photo',    'Foto de evolução semanal',25, true, '{}'::jsonb),
    (_tenant_id, 'post_video_task', 'Tarefa pós-vídeo',        10, true, '{}'::jsonb)
  ON CONFLICT (tenant_id, mission_kind) DO NOTHING;
END;
$$;

-- 2) Geração idempotente da jornada (12 semanas, missões semanais "weekly_photo" e "post_video_task")
-- Missões diárias permanecem geradas on-the-fly em get_today_mission_summary; aqui criamos os marcos por semana.
CREATE OR REPLACE FUNCTION public.generate_journey_missions(_client_id uuid, _journey_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_start  date;
  v_week   int;
  v_due    date;
  v_inserted int := 0;
  v_label_wp text;
  v_miles_wp int;
BEGIN
  SELECT tenant_id, started_at::date INTO v_tenant, v_start
    FROM public.client_journeys WHERE id = _journey_id AND client_id = _client_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'generate_journey_missions: journey not found';
  END IF;

  PERFORM public.ensure_mission_settings(v_tenant);

  SELECT label, default_miles INTO v_label_wp, v_miles_wp
    FROM public.mission_settings WHERE tenant_id = v_tenant AND mission_kind = 'weekly_photo';
  IF v_label_wp IS NULL THEN v_label_wp := 'Foto de evolução semanal'; v_miles_wp := 25; END IF;

  FOR v_week IN 1..12 LOOP
    v_due := v_start + ((v_week-1) * 7);
    INSERT INTO public.client_missions
      (tenant_id, client_id, journey_id, title, description, miles, due_date, active, mission_type, week_number)
    VALUES
      (v_tenant, _client_id, _journey_id, v_label_wp || ' - Semana ' || v_week,
       'Envie sua foto de evolução da semana ' || v_week, v_miles_wp, v_due, true, 'weekly_photo', v_week)
    ON CONFLICT (client_id, journey_id, mission_type, week_number) WHERE mission_type IS NOT NULL DO NOTHING;
    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'journeyId', _journey_id);
END;
$$;

-- 3) Avaliar Selos de consistência (7/14/21 dias consecutivos com check-in) — idempotente
CREATE OR REPLACE FUNCTION public.evaluate_client_seals(_client_id uuid, _journey_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_streak int := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_d date;
  v_has boolean;
  v_awarded jsonb := '[]'::jsonb;
  v_seal_codes text[] := ARRAY['streak_7','streak_14','streak_21'];
  v_thresholds int[] := ARRAY[7,14,21];
  v_seal_miles int[] := ARRAY[30,60,100];
  i int;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'evaluate_client_seals: client not found'; END IF;

  -- streak: dias consecutivos terminando em v_today com checkin_done = true
  v_d := v_today;
  LOOP
    SELECT (checkin_done IS TRUE) INTO v_has
      FROM public.client_daily_responses
      WHERE client_id = _client_id AND journey_id = _journey_id AND response_date = v_d;
    EXIT WHEN NOT FOUND OR NOT COALESCE(v_has,false);
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  END LOOP;

  FOR i IN 1..array_length(v_seal_codes,1) LOOP
    IF v_streak >= v_thresholds[i] THEN
      INSERT INTO public.client_seals (tenant_id, client_id, journey_id, seal_code, miles_awarded, metadata)
      VALUES (v_tenant, _client_id, _journey_id, v_seal_codes[i], v_seal_miles[i],
              jsonb_build_object('streak', v_streak))
      ON CONFLICT (client_id, journey_id, seal_code) DO NOTHING;
      IF FOUND THEN
        PERFORM public.award_miles(_client_id, 'seal', v_seal_codes[i], v_seal_miles[i],
          'seal:' || _journey_id::text || ':' || v_seal_codes[i],
          'Selo de consistência ' || v_thresholds[i] || ' dias', '{}'::jsonb, _journey_id);
        v_awarded := v_awarded || to_jsonb(v_seal_codes[i]);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('streak', v_streak, 'awarded', v_awarded);
END;
$$;

-- 4) Avaliar Marcos por milhas acumuladas (300/600/900/1300) — idempotente, sem milhas extras
CREATE OR REPLACE FUNCTION public.evaluate_client_milestones(_client_id uuid, _journey_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_total int;
  v_thresholds int[] := ARRAY[300,600,900,1300];
  v_codes text[] := ARRAY['milestone_300','milestone_600','milestone_900','milestone_1300'];
  v_awarded jsonb := '[]'::jsonb;
  i int;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.clients WHERE id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'evaluate_client_milestones: client not found'; END IF;

  SELECT COALESCE(SUM(miles),0) INTO v_total
    FROM public.miles_ledger
    WHERE client_id = _client_id AND journey_id = _journey_id;

  FOR i IN 1..array_length(v_thresholds,1) LOOP
    IF v_total >= v_thresholds[i] THEN
      INSERT INTO public.client_journey_milestones
        (tenant_id, client_id, journey_id, milestone_code, miles_threshold)
      VALUES (v_tenant, _client_id, _journey_id, v_codes[i], v_thresholds[i])
      ON CONFLICT (client_id, milestone_code) DO NOTHING;
      IF FOUND THEN v_awarded := v_awarded || to_jsonb(v_codes[i]); END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('milesTotal', v_total, 'reached', v_awarded);
END;
$$;

-- 5) Trigger: após inserir milhas, reavaliar marcos automaticamente
CREATE OR REPLACE FUNCTION public.trg_after_miles_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.journey_id IS NOT NULL THEN
    PERFORM public.evaluate_client_milestones(NEW.client_id, NEW.journey_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_miles_ledger_after_insert ON public.miles_ledger;
CREATE TRIGGER trg_miles_ledger_after_insert
AFTER INSERT ON public.miles_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_after_miles_insert();

-- 6) Trigger: após inserir/atualizar respostas diárias com checkin_done, reavaliar selos
CREATE OR REPLACE FUNCTION public.trg_after_daily_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.journey_id IS NOT NULL AND COALESCE(NEW.checkin_done,false) = true THEN
    PERFORM public.evaluate_client_seals(NEW.client_id, NEW.journey_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_responses_after_change ON public.client_daily_responses;
CREATE TRIGGER trg_daily_responses_after_change
AFTER INSERT OR UPDATE ON public.client_daily_responses
FOR EACH ROW EXECUTE FUNCTION public.trg_after_daily_response();

-- 7) Snapshot de progresso de jornada para UI
CREATE OR REPLACE FUNCTION public.get_journey_progress(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_journey uuid;
  v_started date;
  v_miles_total int;
  v_seals jsonb;
  v_milestones jsonb;
  v_streak int := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_d date;
  v_has boolean;
BEGIN
  SELECT active_journey_id INTO v_journey FROM public.clients WHERE id = _client_id;
  IF v_journey IS NULL THEN
    RETURN jsonb_build_object('journeyId', NULL);
  END IF;

  SELECT started_at::date INTO v_started FROM public.client_journeys WHERE id = v_journey;

  SELECT COALESCE(SUM(miles),0) INTO v_miles_total
    FROM public.miles_ledger WHERE client_id = _client_id AND journey_id = v_journey;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',seal_code,'miles',miles_awarded,'awardedAt',awarded_at) ORDER BY awarded_at), '[]'::jsonb)
    INTO v_seals FROM public.client_seals WHERE client_id = _client_id AND journey_id = v_journey;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',milestone_code,'threshold',miles_threshold,'reachedAt',reached_at) ORDER BY miles_threshold), '[]'::jsonb)
    INTO v_milestones FROM public.client_journey_milestones WHERE client_id = _client_id AND journey_id = v_journey;

  v_d := v_today;
  LOOP
    SELECT (checkin_done IS TRUE) INTO v_has
      FROM public.client_daily_responses
      WHERE client_id = _client_id AND journey_id = v_journey AND response_date = v_d;
    EXIT WHEN NOT FOUND OR NOT COALESCE(v_has,false);
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  END LOOP;

  RETURN jsonb_build_object(
    'journeyId', v_journey,
    'startedAt', v_started,
    'milesTotal', v_miles_total,
    'streakDays', v_streak,
    'seals', v_seals,
    'milestones', v_milestones
  );
END;
$$;