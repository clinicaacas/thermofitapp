
-- 1) get_journey_progress
CREATE OR REPLACE FUNCTION public.get_journey_progress(_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT started_on INTO v_started FROM public.client_journeys WHERE id = v_journey;

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
$function$;

-- 2) generate_journey_missions
CREATE OR REPLACE FUNCTION public.generate_journey_missions(_client_id uuid, _journey_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_start  date;
  v_week   int;
  v_due    date;
  v_inserted int := 0;
  v_label_wp text;
  v_miles_wp int;
BEGIN
  SELECT tenant_id, started_on INTO v_tenant, v_start
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
    ON CONFLICT (client_id, journey_id, mission_type, week_number)
      WHERE mission_type IS NOT NULL AND mission_type IN ('weekly_photo')
      DO NOTHING;
    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'journeyId', _journey_id);
END;
$function$;

-- 3) evaluate_client_seals
CREATE OR REPLACE FUNCTION public.evaluate_client_seals(_client_id uuid, _journey_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT c.tenant_id, j.started_on, j.status
    INTO v_tenant, v_started, v_status
    FROM public.clients c
    JOIN public.client_journeys j ON j.id = _journey_id
    WHERE c.id = _client_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'evaluate_client_seals: client/journey not found'; END IF;

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
$function$;

-- 4) ensure_post_video_task
CREATE OR REPLACE FUNCTION public.ensure_post_video_task(_client_id uuid, _journey_id uuid, _day date, _video_id uuid, _task_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_start date;
  v_label text;
  v_miles int;
  v_id uuid;
BEGIN
  IF _task_ref IS NULL OR length(_task_ref) = 0 THEN
    RAISE EXCEPTION 'ensure_post_video_task: task_ref obrigatório';
  END IF;
  SELECT tenant_id, started_on INTO v_tenant, v_start
    FROM public.client_journeys WHERE id = _journey_id AND client_id = _client_id;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  PERFORM public.ensure_mission_settings(v_tenant);

  SELECT label, default_miles INTO v_label, v_miles
    FROM public.mission_settings WHERE tenant_id = v_tenant AND mission_kind = 'post_video_task';
  IF v_label IS NULL THEN v_label := 'Tarefa pós-vídeo'; v_miles := 10; END IF;

  IF _video_id IS NOT NULL THEN
    INSERT INTO public.client_missions
      (tenant_id, client_id, journey_id, title, miles, due_date, active, mission_type, week_number, linked_video_id, task_ref)
    VALUES (v_tenant, _client_id, _journey_id, v_label, v_miles, _day, true, 'post_video_task',
            GREATEST(1, ((_day - v_start)/7) + 1), _video_id, _task_ref)
    ON CONFLICT (client_id, journey_id, mission_type, due_date, linked_video_id, task_ref)
      WHERE mission_type = 'post_video_task' AND linked_video_id IS NOT NULL
      DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.client_missions
        WHERE client_id=_client_id AND journey_id=_journey_id AND mission_type='post_video_task'
          AND due_date=_day AND linked_video_id=_video_id AND task_ref=_task_ref LIMIT 1;
    END IF;
  ELSE
    INSERT INTO public.client_missions
      (tenant_id, client_id, journey_id, title, miles, due_date, active, mission_type, week_number, task_ref)
    VALUES (v_tenant, _client_id, _journey_id, v_label, v_miles, _day, true, 'post_video_task',
            GREATEST(1, ((_day - v_start)/7) + 1), _task_ref)
    ON CONFLICT (client_id, journey_id, mission_type, due_date, task_ref)
      WHERE mission_type = 'post_video_task' AND linked_video_id IS NULL AND task_ref IS NOT NULL
      DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.client_missions
        WHERE client_id=_client_id AND journey_id=_journey_id AND mission_type='post_video_task'
          AND due_date=_day AND linked_video_id IS NULL AND task_ref=_task_ref LIMIT 1;
    END IF;
  END IF;
  RETURN v_id;
END;
$function$;

-- 5) ensure_video_mission
CREATE OR REPLACE FUNCTION public.ensure_video_mission(_client_id uuid, _journey_id uuid, _day date, _video_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_start date;
  v_label text;
  v_miles int;
  v_id uuid;
BEGIN
  SELECT tenant_id, started_on INTO v_tenant, v_start
    FROM public.client_journeys WHERE id = _journey_id AND client_id = _client_id;
  IF v_tenant IS NULL OR _video_id IS NULL THEN RETURN NULL; END IF;
  PERFORM public.ensure_mission_settings(v_tenant);

  SELECT label, default_miles INTO v_label, v_miles
    FROM public.mission_settings WHERE tenant_id = v_tenant AND mission_kind = 'video_complete';
  IF v_label IS NULL THEN v_label := 'Vídeo do dia concluído'; v_miles := 5; END IF;

  INSERT INTO public.client_missions
    (tenant_id, client_id, journey_id, title, miles, due_date, active, mission_type, week_number, linked_video_id)
  VALUES (v_tenant, _client_id, _journey_id, v_label, v_miles, _day, true, 'video_complete',
          GREATEST(1, ((_day - v_start)/7) + 1), _video_id)
  ON CONFLICT (client_id, journey_id, mission_type, due_date, linked_video_id)
    WHERE mission_type = 'video_complete' AND linked_video_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.client_missions
      WHERE client_id = _client_id AND journey_id = _journey_id
        AND mission_type = 'video_complete' AND due_date = _day AND linked_video_id = _video_id
      LIMIT 1;
  END IF;
  RETURN v_id;
END;
$function$;

-- 6) ensure_daily_missions
CREATE OR REPLACE FUNCTION public.ensure_daily_missions(_client_id uuid, _journey_id uuid, _day date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_kinds text[] := ARRAY['daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo'];
  v_kind text;
  v_label text;
  v_miles int;
  v_start date;
BEGIN
  SELECT tenant_id, started_on INTO v_tenant, v_start
    FROM public.client_journeys WHERE id = _journey_id AND client_id = _client_id;
  IF v_tenant IS NULL THEN RETURN; END IF;
  PERFORM public.ensure_mission_settings(v_tenant);

  FOREACH v_kind IN ARRAY v_kinds LOOP
    SELECT label, default_miles INTO v_label, v_miles
      FROM public.mission_settings WHERE tenant_id = v_tenant AND mission_kind = v_kind;
    IF v_label IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.client_missions
      (tenant_id, client_id, journey_id, title, miles, due_date, active, mission_type, week_number)
    VALUES (v_tenant, _client_id, _journey_id, v_label, v_miles, _day, true, v_kind,
            GREATEST(1, ((_day - v_start)/7) + 1))
    ON CONFLICT (client_id, journey_id, mission_type, due_date)
      WHERE mission_type IS NOT NULL
        AND mission_type IN ('daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo')
      DO NOTHING;
  END LOOP;
END;
$function$;
