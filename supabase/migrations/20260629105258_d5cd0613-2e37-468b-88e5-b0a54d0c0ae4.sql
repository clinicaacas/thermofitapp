CREATE OR REPLACE FUNCTION public.validate_video_journey_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_journey_tenant uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'videos.tenant_id não pode ser nulo';
  END IF;
  IF NEW.journey_id IS NOT NULL THEN
    SELECT tenant_id INTO v_journey_tenant
      FROM public.client_journeys
      WHERE id = NEW.journey_id;
    IF v_journey_tenant IS NULL THEN
      RAISE EXCEPTION 'videos.journey_id % não referencia uma jornada existente', NEW.journey_id;
    END IF;
    IF v_journey_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'videos.tenant_id (%) difere do tenant da jornada % (tenant %)',
        NEW.tenant_id, NEW.journey_id, v_journey_tenant;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_video_journey_tenant ON public.videos;
CREATE TRIGGER trg_validate_video_journey_tenant
BEFORE INSERT OR UPDATE OF tenant_id, journey_id ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.validate_video_journey_tenant();
