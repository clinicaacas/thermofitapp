REVOKE ALL ON FUNCTION public.broadcast_client_photo_event(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_client_photo_event(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.broadcast_client_photo_event(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_client_photo_event(uuid, text, uuid) TO service_role;