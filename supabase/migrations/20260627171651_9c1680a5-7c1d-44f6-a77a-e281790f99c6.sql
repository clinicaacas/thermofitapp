
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.materialize_daily_missions_all(_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Missões diárias estruturais (idempotente; ON CONFLICT DO NOTHING)
    PERFORM public.ensure_daily_missions(v_journey.client_id, v_journey.journey_id, v_day);

    -- Missões de vídeo do dia, conforme release_day da jornada
    v_journey_day := GREATEST(0, v_day - v_journey.started_on);
    FOR v_video IN
      SELECT id FROM public.videos
       WHERE tenant_id = v_journey.tenant_id
         AND status = 'ativo'
         AND release_day = v_journey_day
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
$$;

REVOKE ALL ON FUNCTION public.materialize_daily_missions_all(date) FROM public;
GRANT EXECUTE ON FUNCTION public.materialize_daily_missions_all(date) TO service_role;
