
-- 1) Active journey identity on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS active_journey_id uuid;

UPDATE public.clients
SET active_journey_id = gen_random_uuid()
WHERE active_journey_id IS NULL;

ALTER TABLE public.clients
  ALTER COLUMN active_journey_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.clients
  ALTER COLUMN active_journey_id SET NOT NULL;

-- 2) journey_id on photos (nullable; no destructive backfill)
ALTER TABLE public.client_progress_photos
  ADD COLUMN IF NOT EXISTS journey_id uuid;

CREATE INDEX IF NOT EXISTS client_progress_photos_journey_idx
  ON public.client_progress_photos (client_id, journey_id, week);

-- 3) Mission typing for idempotent weekly photo mission
ALTER TABLE public.client_missions
  ADD COLUMN IF NOT EXISTS mission_type text,
  ADD COLUMN IF NOT EXISTS journey_id uuid,
  ADD COLUMN IF NOT EXISTS week_number integer;

CREATE UNIQUE INDEX IF NOT EXISTS client_missions_typed_unique
  ON public.client_missions (client_id, journey_id, mission_type, week_number)
  WHERE mission_type IS NOT NULL;

-- 4) Stop replicating photo rows via postgres_changes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_progress_photos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.client_progress_photos';
  END IF;
END$$;

ALTER TABLE public.client_progress_photos REPLICA IDENTITY DEFAULT;

-- 5) Authorization helper for private broadcast topic
CREATE OR REPLACE FUNCTION public.can_access_client_photos_topic(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id
      AND (
        c.auth_user_id = _user_id
        OR public.is_tenant_member(_user_id, c.tenant_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_client_photos_topic(uuid, uuid) TO authenticated;

-- 6) Server-side broadcast emitter (minimal payload, private channel)
CREATE OR REPLACE FUNCTION public.broadcast_client_photo_event(
  p_client_id uuid,
  p_change text,
  p_photo_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_change NOT IN ('created','updated','deleted') THEN
    RAISE EXCEPTION 'invalid change %', p_change;
  END IF;
  PERFORM realtime.send(
    jsonb_build_object(
      'type', 'client_photo_changed',
      'clientId', p_client_id,
      'change', p_change,
      'photoId', p_photo_id,
      'occurredAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'client_photo_changed',
    'client-photos:' || p_client_id::text,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_client_photo_event(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_client_photo_event(uuid, text, uuid) TO service_role;

-- 7) RLS for the private broadcast topic
DROP POLICY IF EXISTS "client_photos_topic_read" ON realtime.messages;
CREATE POLICY "client_photos_topic_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'client-photos:%'
    AND public.can_access_client_photos_topic(
      (SELECT auth.uid()),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  );
