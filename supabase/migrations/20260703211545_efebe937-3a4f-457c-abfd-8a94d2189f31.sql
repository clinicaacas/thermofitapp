-- 1) Zerar Milhas do check-in diário para todos os tenants (novas conclusões).
UPDATE public.mission_settings
   SET default_miles = 0, updated_at = now()
 WHERE mission_kind = 'daily_checkin';

-- 2) Seed padrão passa a criar daily_checkin com 0 milhas em novos tenants.
CREATE OR REPLACE FUNCTION public.ensure_mission_settings(_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.mission_settings (tenant_id, mission_kind, label, default_miles, active, metadata)
  VALUES
    (_tenant_id, 'daily_checkin',   'Check-in diário',          0, true, '{}'::jsonb),
    (_tenant_id, 'daily_meal',      'Alimentação do dia',       5, true, '{}'::jsonb),
    (_tenant_id, 'daily_workout',   'Treino do dia',           10, true, '{}'::jsonb),
    (_tenant_id, 'workout_photo',   'Foto do treino',           5, true, '{}'::jsonb),
    (_tenant_id, 'hydration_goal',  'Meta de hidratação',      10, true, '{}'::jsonb),
    (_tenant_id, 'video_complete',  'Vídeo do dia concluído',   5, true, '{}'::jsonb),
    (_tenant_id, 'weekly_photo',    'Foto de evolução semanal',15, true, '{}'::jsonb),
    (_tenant_id, 'post_video_task', 'Tarefa pós-vídeo',        10, true, '{}'::jsonb)
  ON CONFLICT (tenant_id, mission_kind) DO NOTHING;
END;
$function$;

-- 3) Convenção oficial: `videos.release_day` é 1-indexado (Dia 1 = release_day 1).
--    Ajusta a rotina diária para casar `release_day = dias_desde_inicio + 1`.
CREATE OR REPLACE FUNCTION public.materialize_daily_missions_all(_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day date := COALESCE(_day, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_journey RECORD;
  v_video RECORD;
  v_journey_day int;
  v_count_journeys int := 0;
  v_count_videos int := 0;
BEGIN
  FOR v_journey IN
    SELECT j.id AS journey_id, j.client_id, j.started_on, c.tenant_id
      FROM public.client_journeys j
      JOIN public.clients c ON c.id = j.client_id
     WHERE j.status = 'active'
  LOOP
    PERFORM public.ensure_daily_missions(v_journey.client_id, v_journey.journey_id, v_day);

    -- dias transcorridos + 1 = número humano do dia da jornada
    v_journey_day := GREATEST(0, v_day - v_journey.started_on) + 1;
    FOR v_video IN
      SELECT id FROM public.videos
       WHERE tenant_id = v_journey.tenant_id
         AND status = 'ativo'
         AND release_day = v_journey_day
         AND (journey_id IS NULL OR journey_id = v_journey.journey_id)
    LOOP
      PERFORM public.ensure_video_mission(v_journey.client_id, v_journey.journey_id, v_day, v_video.id);
      v_count_videos := v_count_videos + 1;
    END LOOP;

    v_count_journeys := v_count_journeys + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'day', v_day,
    'journeys', v_count_journeys,
    'videoMissions', v_count_videos,
    'ranAt', now()
  );
END;
$function$;

-- 4) Recupera imediatamente clientes ativas: materializa missões de vídeo de hoje.
SELECT public.materialize_daily_missions_all();
