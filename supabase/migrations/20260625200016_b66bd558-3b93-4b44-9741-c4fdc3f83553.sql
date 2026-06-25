
-- Adicionar referências para vídeo e tarefa nas missões
ALTER TABLE public.client_missions
  ADD COLUMN IF NOT EXISTS linked_video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_ref text;

CREATE INDEX IF NOT EXISTS idx_client_missions_linked_video ON public.client_missions(linked_video_id) WHERE linked_video_id IS NOT NULL;

-- Reconstruir índices de unicidade conforme regras
DROP INDEX IF EXISTS public.client_missions_daily_unique;
DROP INDEX IF EXISTS public.client_missions_weekly_unique;

-- 1) Rotinas diárias simples: 1 por tipo por dia
CREATE UNIQUE INDEX client_missions_daily_routine_unique
  ON public.client_missions (client_id, journey_id, mission_type, due_date)
  WHERE mission_type IS NOT NULL
    AND mission_type IN ('daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo');

-- 2) Vídeos: 1 missão por vídeo por dia
CREATE UNIQUE INDEX client_missions_video_unique
  ON public.client_missions (client_id, journey_id, mission_type, due_date, linked_video_id)
  WHERE mission_type = 'video_complete' AND linked_video_id IS NOT NULL;

-- 3) Tarefa pós-vídeo vinculada a vídeo: única por (vídeo + task_ref) no dia
CREATE UNIQUE INDEX client_missions_post_video_task_unique
  ON public.client_missions (client_id, journey_id, mission_type, due_date, linked_video_id, task_ref)
  WHERE mission_type = 'post_video_task' AND linked_video_id IS NOT NULL;

-- 4) Tarefa diária (sem vídeo): única por task_ref no dia
CREATE UNIQUE INDEX client_missions_daily_task_unique
  ON public.client_missions (client_id, journey_id, mission_type, due_date, task_ref)
  WHERE mission_type = 'post_video_task' AND linked_video_id IS NULL AND task_ref IS NOT NULL;

-- 5) Foto semanal: unicidade por semana (mantida)
CREATE UNIQUE INDEX client_missions_weekly_photo_unique
  ON public.client_missions (client_id, journey_id, mission_type, week_number)
  WHERE mission_type = 'weekly_photo';

-- Atualizar ensure_mission_settings para refletir +5 Milhas por vídeo
UPDATE public.mission_settings SET default_miles = 5 WHERE mission_kind = 'video_complete' AND default_miles <> 5;

CREATE OR REPLACE FUNCTION public.ensure_mission_settings(_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.mission_settings (tenant_id, mission_kind, label, default_miles, active, metadata)
  VALUES
    (_tenant_id, 'daily_checkin',   'Check-in diário',         10, true, '{}'::jsonb),
    (_tenant_id, 'daily_meal',      'Alimentação do dia',      10, true, '{}'::jsonb),
    (_tenant_id, 'daily_workout',   'Treino do dia',           15, true, '{}'::jsonb),
    (_tenant_id, 'workout_photo',   'Foto do treino',          10, true, '{}'::jsonb),
    (_tenant_id, 'hydration_goal',  'Meta de hidratação',      10, true, '{}'::jsonb),
    (_tenant_id, 'video_complete',  'Vídeo do dia concluído',   5, true, '{}'::jsonb),
    (_tenant_id, 'weekly_photo',    'Foto de evolução semanal',25, true, '{}'::jsonb),
    (_tenant_id, 'post_video_task', 'Tarefa pós-vídeo',        10, true, '{}'::jsonb)
  ON CONFLICT (tenant_id, mission_kind) DO NOTHING;
END;
$function$;

-- Helper: ensure_video_mission (cria missão por vídeo no dia)
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
  SELECT tenant_id, started_at::date INTO v_tenant, v_start
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

-- Helper: ensure_post_video_task (cria tarefa pós-vídeo, por vídeo ou por dia)
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
  SELECT tenant_id, started_at::date INTO v_tenant, v_start
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

-- Atualizar ensure_daily_missions (somente rotinas diárias simples)
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
        AND mission_type IN ('daily_checkin','daily_meal','daily_workout','hydration_goal','workout_photo')
      DO NOTHING;
  END LOOP;
END;
$function$;
