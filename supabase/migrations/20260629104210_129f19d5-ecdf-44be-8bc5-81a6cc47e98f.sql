
-- Add journey-scoping to videos so test/journey-specific videos don't leak to other clients in the same tenant.
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS journey_id uuid NULL REFERENCES public.client_journeys(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS videos_journey_id_idx ON public.videos(journey_id);

-- Tag existing [E2E] test videos to the E2E journey so they stop appearing for Celestina/other clients.
UPDATE public.videos
   SET journey_id = 'e2e00001-0000-0000-0000-0000000000a1'
 WHERE id IN (
   'e2e00001-0000-0000-0000-00000000d001',
   'e2e00001-0000-0000-0000-00000000d002'
 );

-- Update video-mission materialization to honor journey scoping.
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

    v_journey_day := GREATEST(0, v_day - v_journey.started_on);
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
