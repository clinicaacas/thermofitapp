REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_manager(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO service_role;