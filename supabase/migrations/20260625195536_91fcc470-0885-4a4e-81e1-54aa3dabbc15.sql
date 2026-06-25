
-- Corrigir unicidade: separar missões diárias (por due_date) das semanais (por week_number)
DROP INDEX IF EXISTS public.client_missions_typed_unique;

-- Unicidade para missões DIÁRIAS: usa due_date como referência do dia
CREATE UNIQUE INDEX IF NOT EXISTS client_missions_daily_unique
  ON public.client_missions (client_id, journey_id, mission_type, due_date)
  WHERE mission_type IS NOT NULL
    AND mission_type IN ('daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo','video_complete','post_video_task');

-- Unicidade para missões SEMANAIS (Foto de Evolução): mantém week_number
CREATE UNIQUE INDEX IF NOT EXISTS client_missions_weekly_unique
  ON public.client_missions (client_id, journey_id, mission_type, week_number)
  WHERE mission_type IS NOT NULL
    AND mission_type IN ('weekly_photo');

-- Atualizar ensure_daily_missions para usar due_date como chave de conflito
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
  SELECT tenant_id, started_at::date INTO v_tenant, v_start
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
        AND mission_type IN ('daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo','video_complete','post_video_task')
      DO NOTHING;
  END LOOP;
END;
$function$;

-- Atualizar generate_journey_missions (semanal) para usar a nova chave semanal
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
    ON CONFLICT (client_id, journey_id, mission_type, week_number)
      WHERE mission_type IS NOT NULL AND mission_type IN ('weekly_photo')
      DO NOTHING;
    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'journeyId', _journey_id);
END;
$function$;
