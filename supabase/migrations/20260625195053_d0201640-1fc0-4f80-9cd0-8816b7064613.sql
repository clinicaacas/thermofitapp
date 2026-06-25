-- 1) Geração idempotente das missões diárias para o dia atual
CREATE OR REPLACE FUNCTION public.ensure_daily_missions(_client_id uuid, _journey_id uuid, _day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_kinds text[] := ARRAY['daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo'];
  v_kind text;
  v_label text;
  v_miles int;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.client_journeys WHERE id = _journey_id AND client_id = _client_id;
  IF v_tenant IS NULL THEN RETURN; END IF;
  PERFORM public.ensure_mission_settings(v_tenant);

  FOREACH v_kind IN ARRAY v_kinds LOOP
    SELECT label, default_miles INTO v_label, v_miles
      FROM public.mission_settings WHERE tenant_id = v_tenant AND mission_kind = v_kind;
    IF v_label IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.client_missions
      (tenant_id, client_id, journey_id, title, miles, due_date, active, mission_type, week_number)
    VALUES (v_tenant, _client_id, _journey_id, v_label, v_miles, _day, true, v_kind,
            GREATEST(1, ((_day - (SELECT started_at::date FROM public.client_journeys WHERE id=_journey_id))/7) + 1))
    ON CONFLICT (client_id, journey_id, mission_type, week_number) WHERE mission_type IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

-- 2) Reescreve avaliação de Selos: dia válido = 4+ missões elegíveis concluídas no dia
-- Fonte canônica: miles_ledger (toda conclusão concede milhas idempotentemente)
CREATE OR REPLACE FUNCTION public.evaluate_client_seals(_client_id uuid, _journey_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_started date;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_streak int := 0;
  v_d date;
  v_count int;
  v_awarded jsonb := '[]'::jsonb;
  v_eligible text[] := ARRAY['daily_checkin','daily_meal','daily_workout','hydration_goal','video_complete','post_video_task','weekly_photo'];
  v_codes text[] := ARRAY['streak_7','streak_14','streak_21'];
  v_thresholds int[] := ARRAY[7,14,21];
  v_seal_miles int[] := ARRAY[20,40,70];
  v_status text;
  v_days_elapsed int;
  i int;
BEGIN
  SELECT c.tenant_id, j.started_at::date, j.status
    INTO v_tenant, v_started, v_status
    FROM public.clients c
    JOIN public.client_journeys j ON j.id = _journey_id
    WHERE c.id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'evaluate_client_seals: client/journey not found'; END IF;

  -- Contar streak terminando em v_today com 4+ missões elegíveis distintas concluídas no dia
  v_d := v_today;
  LOOP
    EXIT WHEN v_d < v_started;
    SELECT COUNT(DISTINCT source_kind) INTO v_count
      FROM public.miles_ledger
      WHERE client_id = _client_id
        AND journey_id = _journey_id
        AND occurred_on = v_d
        AND source_kind = ANY(v_eligible);
    EXIT WHEN COALESCE(v_count,0) < 4;
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  END LOOP;

  FOR i IN 1..array_length(v_codes,1) LOOP
    IF v_streak >= v_thresholds[i] THEN
      INSERT INTO public.client_seals (tenant_id, client_id, journey_id, seal_code, miles_awarded, metadata)
      VALUES (v_tenant, _client_id, _journey_id, v_codes[i], v_seal_miles[i], jsonb_build_object('streak', v_streak))
      ON CONFLICT (client_id, journey_id, seal_code) DO NOTHING;
      IF FOUND THEN
        PERFORM public.award_miles(_client_id, 'seal', v_codes[i], v_seal_miles[i],
          'seal:' || _journey_id::text || ':' || v_codes[i],
          'Selo de constância ' || v_thresholds[i] || ' dias', '{}'::jsonb, _journey_id);
        v_awarded := v_awarded || to_jsonb(v_codes[i]);
      END IF;
    END IF;
  END LOOP;

  -- Programa Completo: concluída pelo admin OU 84 dias decorridos
  v_days_elapsed := (v_today - v_started);
  IF v_status = 'completed' OR v_days_elapsed >= 84 THEN
    INSERT INTO public.client_seals (tenant_id, client_id, journey_id, seal_code, miles_awarded, metadata)
    VALUES (v_tenant, _client_id, _journey_id, 'program_complete', 100,
            jsonb_build_object('daysElapsed', v_days_elapsed, 'status', v_status))
    ON CONFLICT (client_id, journey_id, seal_code) DO NOTHING;
    IF FOUND THEN
      PERFORM public.award_miles(_client_id, 'seal', 'program_complete', 100,
        'seal:' || _journey_id::text || ':program_complete',
        'Selo Programa Completo', '{}'::jsonb, _journey_id);
      v_awarded := v_awarded || to_jsonb('program_complete'::text);
    END IF;
  END IF;

  RETURN jsonb_build_object('streak', v_streak, 'awarded', v_awarded);
END;
$$;

-- 3) Trigger pós-milhas: agora reavalia Marcos E Selos (já que Selos dependem de milhas no dia)
CREATE OR REPLACE FUNCTION public.trg_after_miles_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.journey_id IS NOT NULL THEN
    PERFORM public.evaluate_client_milestones(NEW.client_id, NEW.journey_id);
    -- Só reavalia Selos para eventos elegíveis do dia (evita recursão por concessão do próprio selo)
    IF NEW.source_kind IN ('daily_checkin','daily_meal','daily_workout','hydration_goal','video_complete','post_video_task','weekly_photo') THEN
      PERFORM public.evaluate_client_seals(NEW.client_id, NEW.journey_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;